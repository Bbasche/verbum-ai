import { EventEmitter } from "node:events";
import { existsSync, readFileSync, readdirSync, statSync, watch } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

import type {
  AppMessage,
  BridgeSnapshot,
  ConversationSummary,
  MessageBlock,
  RunTerminalRequest,
  SendMessageRequest,
  SpawnConversationRequest,
  SourceDescriptor,
  TerminalSession
} from "../shared/bridge-types.js";

interface ClaudeTaskFile {
  id?: string;
  subject?: string;
  description?: string;
  activeForm?: string;
  status?: string;
}

interface CustomSourceConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  autostart?: boolean;
}

interface VerbumAppConfig {
  workspaceRoot?: string;
  customSources?: CustomSourceConfig[];
}

export class BridgeManager extends EventEmitter<{
  snapshot: [snapshot: BridgeSnapshot];
}> {
  private readonly version = "0.1.0";
  private readonly workspaceRoot: string;
  private readonly claudeTasksDir = join(homedir(), ".claude", "tasks");
  private readonly conversations = new Map<string, ConversationSummary>();
  private readonly sources = new Map<string, SourceDescriptor>();
  private readonly messages: AppMessage[] = [];
  private readonly busEvents: string[] = [];
  private readonly terminals = new Map<string, TerminalSession>();
  private readonly processedClaudeFiles = new Set<string>();
  private customSourceProcessesStarted = false;

  constructor() {
    super();

    const config = this.loadConfig();
    this.workspaceRoot =
      config.workspaceRoot ?? process.env.VERBUM_WORKSPACE_ROOT ?? inferWorkspaceRoot(process.cwd());

    this.seedSources(config.customSources ?? []);
    this.seedTerminals();
    this.seedWelcomeMessages();
  }

  start(): void {
    this.detectBuiltIns();
    this.startClaudeTaskWatcher();
    this.startCustomSources();
    this.emitSnapshot();
  }

  getSnapshot(): BridgeSnapshot {
    return {
      version: this.version,
      workspaceRoot: this.workspaceRoot,
      conversations: [...this.conversations.values()],
      sources: [...this.sources.values()],
      messages: [...this.messages],
      busEvents: [...this.busEvents],
      terminals: [...this.terminals.values()],
      demoCommands: [
        {
          label: "Run package tests",
          command: "npm test --workspace verbum",
          sessionId: "shell-1"
        },
        {
          label: "Show core files",
          command: "find packages/verbum/src -maxdepth 2 -type f | sort",
          sessionId: "shell-1"
        },
        {
          label: "Show Claude task files",
          command: "find ~/.claude/tasks -maxdepth 2 -type f | head -n 10",
          sessionId: "shell-2"
        }
      ]
    };
  }

  async sendMessage(request: SendMessageRequest): Promise<void> {
    const content = request.content.trim();
    const conversation = this.ensureConversation(request.conversationId, "Master");
    if (!content) {
      return;
    }

    this.pushMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      sourceId: "inbox",
      sourceLabel: "Inbox",
      sourceKind: "human",
      role: "user",
      title: "Routed message",
      timestamp: timestamp(),
      blocks: [{ type: "markdown", text: content }]
    });

    if (request.routeTo === "claude-code") {
      await this.sendToClaude(content, conversation);
      return;
    }

    if (request.routeTo === "codex") {
      await this.sendToCodex(content, conversation);
      return;
    }

    if (request.routeTo === "shell-1" || request.routeTo === "shell-2") {
      await this.runTerminalCommand({
        sessionId: request.routeTo,
        command: content,
        conversationId: conversation.id
      });
      return;
    }

    this.pushMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      sourceId: request.routeTo,
      sourceLabel: this.sources.get(request.routeTo)?.name ?? request.routeTo,
      sourceKind: this.sources.get(request.routeTo)?.kind ?? "custom",
      role: "system",
      title: "Route accepted",
      timestamp: timestamp(),
      blocks: [
        {
          type: "markdown",
          text: `Verbum recorded your message for \`${request.routeTo}\`. That source does not implement direct prompting yet, but it can still stream observed events into the app.`
        }
      ]
    });
  }

  async runTerminalCommand(request: RunTerminalRequest): Promise<void> {
    const conversation = this.ensureConversation(request.conversationId, "Master");
    const terminal = this.terminals.get(request.sessionId);
    if (!terminal) {
      return;
    }

    const shell = process.env.SHELL ?? "/bin/zsh";
    const output = await spawnToString(shell, ["-lc", request.command], terminal.cwd);
    terminal.lastCommand = request.command;
    terminal.lines = [`$ ${request.command}`, ...output.split("\n").filter(Boolean)].slice(-20);

    this.pushMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      sourceId: request.sessionId,
      sourceLabel: terminal.title,
      sourceKind: "terminal",
      role: "tool",
      title: "Terminal command",
      timestamp: timestamp(),
      blocks: [
        {
          type: "command",
          command: request.command,
          output: output.trim() || "(no output)"
        }
      ]
    });

    this.pushBusEvent(`${terminal.title} ran ${request.command}`);
    this.emitSnapshot();
  }

  spawnConversation(request: SpawnConversationRequest = {}): ConversationSummary {
    const id = `conv-${randomUUID().slice(0, 8)}`;
    const summary: ConversationSummary = {
      id,
      title: request.title?.trim() || `Side thread ${this.conversations.size}`,
      status: "active",
      lastActivity: timestamp()
    };
    this.conversations.set(id, summary);
    this.pushBusEvent(`Spawned conversation: ${summary.title}`);
    this.emitSnapshot();
    return summary;
  }

  async runLaunchDemo(): Promise<void> {
    const conversation = this.spawnConversation({ title: "2-minute demo" });
    await this.sendMessage({
      conversationId: conversation.id,
      routeTo: "codex",
      content:
        "In 3 short bullets, explain why a message-based orchestration framework is easier to debug than ad-hoc tool glue. Mention the router and graph."
    });
    await this.sendMessage({
      conversationId: conversation.id,
      routeTo: "claude-code",
      content:
        "Give me a crisp launch-ready explanation of Verbum as a companion app to Claude Code and Codex, and include one short TypeScript code block."
    });
    await this.runTerminalCommand({
      conversationId: conversation.id,
      sessionId: "shell-1",
      command: "npm test --workspace verbum"
    });
    await this.runTerminalCommand({
      conversationId: conversation.id,
      sessionId: "shell-2",
      command: "find ~/.claude/tasks -maxdepth 2 -type f | head -n 6"
    });
  }

  private loadConfig(): VerbumAppConfig {
    const candidates = [
      resolve(process.cwd(), "verbum.app.config.json"),
      join(homedir(), ".config", "verbum", "app.json")
    ];

    for (const candidate of candidates) {
      if (!existsSync(candidate)) {
        continue;
      }

      try {
        return JSON.parse(readFileSync(candidate, "utf8")) as VerbumAppConfig;
      } catch {
        return {};
      }
    }

    return {};
  }

  private seedSources(customSources: CustomSourceConfig[]): void {
    const baseSources: SourceDescriptor[] = [
      {
        id: "verbum-app",
        name: "Verbum App",
        kind: "custom",
        subtitle: "Unified desktop control room",
        mode: "replacement",
        connected: true,
        typing: "graph, inbox, search, typed source registry",
        status: "ready"
      },
      {
        id: "claude-code",
        name: "Claude Code",
        kind: "claude-code",
        subtitle: "CLI bridge + task watcher",
        mode: "companion",
        connected: false,
        typing: "assistant text, code blocks, task files",
        status: "checking"
      },
      {
        id: "codex",
        name: "Codex",
        kind: "codex",
        subtitle: "Structured exec bridge",
        mode: "companion",
        connected: false,
        typing: "JSON events, assistant text, tool progress",
        status: "checking"
      },
      {
        id: "shell-1",
        name: "zsh · repo",
        kind: "terminal",
        subtitle: "Repo workspace terminal",
        mode: "replacement",
        connected: true,
        typing: "commands, output, status updates",
        status: "ready"
      },
      {
        id: "shell-2",
        name: "zsh · machine",
        kind: "terminal",
        subtitle: "Machine-level terminal",
        mode: "replacement",
        connected: true,
        typing: "commands, output, file inspection",
        status: "ready"
      },
      {
        id: "inbox",
        name: "Inbox",
        kind: "human",
        subtitle: "Human-in-the-loop routing",
        mode: "replacement",
        connected: true,
        typing: "messages, routing decisions, summaries",
        status: "ready"
      }
    ];

    for (const source of baseSources) {
      this.sources.set(source.id, source);
    }

    for (const source of customSources) {
      this.sources.set(source.id, {
        id: source.id,
        name: source.name,
        kind: "custom",
        subtitle: "Custom source from config",
        mode: "custom",
        connected: false,
        typing: "JSONL or plain text from your own process",
        status: source.autostart === false ? "configured" : "starting",
        command: source.command
      });
    }
  }

  private seedTerminals(): void {
    this.terminals.set("shell-1", {
      id: "shell-1",
      title: "zsh · repo",
      cwd: this.workspaceRoot,
      lines: [
        "$ pwd",
        this.workspaceRoot
      ]
    });
    this.terminals.set("shell-2", {
      id: "shell-2",
      title: "zsh · machine",
      cwd: homedir(),
      lines: [
        "$ echo 'Verbum is watching the machine.'",
        "Verbum is watching the machine."
      ]
    });
  }

  private seedWelcomeMessages(): void {
    this.conversations.set("master", {
      id: "master",
      title: "Master conversation",
      status: "master",
      lastActivity: timestamp()
    });
    this.pushMessage({
      id: randomUUID(),
      conversationId: "master",
      conversationTitle: "Master conversation",
      sourceId: "verbum-app",
      sourceLabel: "Verbum App",
      sourceKind: "custom",
      role: "system",
      title: "Start here",
      timestamp: timestamp(),
      blocks: [
        {
          type: "status-list",
          items: [
            { label: "Workspace", value: this.workspaceRoot },
            { label: "Claude bridge", value: "task watcher + prompt runner" },
            { label: "Codex bridge", value: "JSON exec stream" }
          ]
        }
      ]
    });
    this.pushBusEvent("Verbum App booted and is checking local sources");
  }

  private detectBuiltIns(): void {
    const claude = findExecutable(["claude", "/opt/homebrew/bin/claude"]);
    const codex = findExecutable(["codex", "/Applications/Codex.app/Contents/Resources/codex"]);

    this.updateSource("claude-code", {
      connected: Boolean(claude),
      status: claude ? "connected" : "not installed",
      command: claude ?? undefined
    });
    this.updateSource("codex", {
      connected: Boolean(codex),
      status: codex ? "connected" : "not installed",
      command: codex ?? undefined
    });

    if (claude) {
      this.pushBusEvent("Claude Code detected");
    }

    if (codex) {
      this.pushBusEvent("Codex detected");
    }
  }

  private startClaudeTaskWatcher(): void {
    if (!existsSync(this.claudeTasksDir)) {
      return;
    }

    for (const file of listRecentJsonFiles(this.claudeTasksDir, 8)) {
      this.ingestClaudeTaskFile(file);
    }

    watch(
      this.claudeTasksDir,
      { recursive: true },
      (_eventType, filename) => {
        if (!filename || !filename.endsWith(".json")) {
          return;
        }

        this.ingestClaudeTaskFile(join(this.claudeTasksDir, filename));
      }
    );
  }

  private ingestClaudeTaskFile(filePath: string): void {
    if (!filePath.endsWith(".json") || !existsSync(filePath)) {
      return;
    }

    const fileKey = `${filePath}:${safeMtime(filePath)}`;
    if (this.processedClaudeFiles.has(fileKey)) {
      return;
    }

    try {
      const task = JSON.parse(readFileSync(filePath, "utf8")) as ClaudeTaskFile;
      this.processedClaudeFiles.add(fileKey);
      this.pushMessage({
        id: randomUUID(),
        conversationId: "master",
        conversationTitle: "Master conversation",
        sourceId: "claude-code",
        sourceLabel: "Claude Code",
        sourceKind: "claude-code",
        role: "system",
        title: task.subject ?? "Claude task update",
        timestamp: timestamp(),
        blocks: [
          {
            type: "markdown",
            text: task.description ?? task.activeForm ?? "Claude task file updated."
          },
          {
            type: "status-list",
            items: [
              { label: "Task", value: task.id ?? filePath.split("/").at(-1) ?? "unknown" },
              { label: "Status", value: task.status ?? "unknown" }
            ]
          }
        ]
      });
      this.pushBusEvent(`Claude task updated: ${task.subject ?? task.id ?? "task"}`);
      this.emitSnapshot();
    } catch {
      // Ignore partial writes or non-task files.
    }
  }

  private startCustomSources(): void {
    if (this.customSourceProcessesStarted) {
      return;
    }

    this.customSourceProcessesStarted = true;
    const config = this.loadConfig();

    for (const source of config.customSources ?? []) {
      if (source.autostart === false) {
        continue;
      }

      const child = spawn(source.command, source.args ?? [], {
        cwd: source.cwd ?? this.workspaceRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      });

      this.updateSource(source.id, {
        connected: true,
        status: "streaming",
        command: source.command
      });

      let buffer = "";
      const onChunk = (chunk: Buffer): void => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines.map((value) => value.trim()).filter(Boolean)) {
          this.ingestCustomSourceLine(source.id, source.name, line);
        }
      };

      child.stdout.on("data", onChunk);
      child.stderr.on("data", onChunk);
      child.on("exit", () => {
        this.updateSource(source.id, {
          connected: false,
          status: "stopped"
        });
      });
    }
  }

  private ingestCustomSourceLine(sourceId: string, sourceName: string, line: string): void {
    try {
      const parsed = JSON.parse(line) as Partial<AppMessage> & {
        text?: string;
      };

      if (parsed.blocks && parsed.title) {
        this.pushMessage({
          id: parsed.id ?? randomUUID(),
          conversationId: parsed.conversationId ?? "master",
          conversationTitle: parsed.conversationTitle ?? this.ensureConversation("master", "Master conversation").title,
          sourceId,
          sourceLabel: sourceName,
          sourceKind: "custom",
          role: parsed.role ?? "system",
          title: parsed.title,
          timestamp: parsed.timestamp ?? timestamp(),
          blocks: parsed.blocks
        });
      } else {
        this.pushMessage({
          id: randomUUID(),
          conversationId: "master",
          conversationTitle: "Master conversation",
          sourceId,
          sourceLabel: sourceName,
          sourceKind: "custom",
          role: "system",
          title: "Custom source",
          timestamp: timestamp(),
          blocks: [{ type: "markdown", text: parsed.text ?? line }]
        });
      }
    } catch {
      this.pushMessage({
        id: randomUUID(),
        conversationId: "master",
        conversationTitle: "Master conversation",
        sourceId,
        sourceLabel: sourceName,
        sourceKind: "custom",
        role: "system",
        title: "Custom source",
        timestamp: timestamp(),
        blocks: [{ type: "markdown", text: line }]
      });
    }

    this.emitSnapshot();
  }

  private async sendToCodex(prompt: string, conversation: ConversationSummary): Promise<void> {
    const command = this.sources.get("codex")?.command ?? "codex";
    this.pushBusEvent("Codex started a non-interactive run");
    this.pushMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      sourceId: "codex",
      sourceLabel: "Codex",
      sourceKind: "codex",
      role: "system",
      title: "Codex run started",
      timestamp: timestamp(),
      blocks: [{ type: "markdown", text: prompt }]
    });
    this.emitSnapshot();

    await new Promise<void>((resolvePromise) => {
      const child = spawn(
        command,
        [
          "--ask-for-approval",
          "never",
          "--sandbox",
          "workspace-write",
          "exec",
          "--json",
          "--cd",
          this.workspaceRoot,
          prompt
        ],
        {
          cwd: this.workspaceRoot,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"]
        }
      );

      let buffer = "";
      const flush = (chunk: Buffer): void => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines.map((value) => value.trim()).filter(Boolean)) {
          this.ingestCodexLine(line, conversation);
        }
      };

      child.stdout.on("data", flush);
      child.stderr.on("data", flush);
      child.on("exit", () => {
        this.pushBusEvent("Codex run completed");
        this.emitSnapshot();
        resolvePromise();
      });
    });
  }

  private ingestCodexLine(line: string, conversation: ConversationSummary): void {
    try {
      const event = JSON.parse(line) as {
        type?: string;
        thread_id?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
        item?: {
          type?: string;
          text?: string;
        };
      };

      if (event.type === "thread.started") {
        this.pushMessage({
          id: randomUUID(),
          conversationId: conversation.id,
          conversationTitle: conversation.title,
          sourceId: "codex",
          sourceLabel: "Codex",
          sourceKind: "codex",
          role: "system",
          title: "Codex thread started",
          timestamp: timestamp(),
          blocks: [
            {
              type: "status-list",
              items: [{ label: "Thread", value: event.thread_id ?? "unknown" }]
            }
          ]
        });
        return;
      }

      if (event.type === "item.completed" && event.item?.type === "agent_message") {
        this.pushMessage({
          id: randomUUID(),
          conversationId: conversation.id,
          conversationTitle: conversation.title,
          sourceId: "codex",
          sourceLabel: "Codex",
          sourceKind: "codex",
          role: "assistant",
          title: "Codex answer",
          timestamp: timestamp(),
          blocks: textToBlocks(event.item.text ?? "")
        });
        return;
      }

      if (event.type === "turn.completed") {
        this.pushMessage({
          id: randomUUID(),
          conversationId: conversation.id,
          conversationTitle: conversation.title,
          sourceId: "codex",
          sourceLabel: "Codex",
          sourceKind: "codex",
          role: "system",
          title: "Codex usage",
          timestamp: timestamp(),
          blocks: [
            {
              type: "status-list",
              items: [
                { label: "Input tokens", value: String(event.usage?.input_tokens ?? 0) },
                { label: "Output tokens", value: String(event.usage?.output_tokens ?? 0) }
              ]
            }
          ]
        });
      }
    } catch {
      this.pushMessage({
        id: randomUUID(),
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        sourceId: "codex",
        sourceLabel: "Codex",
        sourceKind: "codex",
        role: "system",
        title: "Codex event",
        timestamp: timestamp(),
        blocks: [{ type: "markdown", text: line }]
      });
    }

    this.emitSnapshot();
  }

  private async sendToClaude(prompt: string, conversation: ConversationSummary): Promise<void> {
    const command = this.sources.get("claude-code")?.command ?? "claude";
    this.pushBusEvent("Claude Code started a printed run");
    this.pushMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      sourceId: "claude-code",
      sourceLabel: "Claude Code",
      sourceKind: "claude-code",
      role: "system",
      title: "Claude prompt started",
      timestamp: timestamp(),
      blocks: [{ type: "markdown", text: prompt }]
    });
    this.emitSnapshot();

    const output = await spawnToString(
      command,
      [
        "-p",
        "--output-format",
        "json",
        "--permission-mode",
        "default",
        prompt
      ],
      this.workspaceRoot
    );

    try {
      const event = JSON.parse(output) as {
        result?: string;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
        };
      };

      this.pushMessage({
        id: randomUUID(),
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        sourceId: "claude-code",
        sourceLabel: "Claude Code",
        sourceKind: "claude-code",
        role: "assistant",
        title: "Claude answer",
        timestamp: timestamp(),
        blocks: textToBlocks(event.result ?? output)
      });

      this.pushMessage({
        id: randomUUID(),
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        sourceId: "claude-code",
        sourceLabel: "Claude Code",
        sourceKind: "claude-code",
        role: "system",
        title: "Claude usage",
        timestamp: timestamp(),
        blocks: [
          {
            type: "status-list",
            items: [
              { label: "Input tokens", value: String(event.usage?.input_tokens ?? 0) },
              { label: "Output tokens", value: String(event.usage?.output_tokens ?? 0) }
            ]
          }
        ]
      });
    } catch {
      this.pushMessage({
        id: randomUUID(),
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        sourceId: "claude-code",
        sourceLabel: "Claude Code",
        sourceKind: "claude-code",
        role: "assistant",
        title: "Claude answer",
        timestamp: timestamp(),
        blocks: textToBlocks(output)
      });
    }

    this.pushBusEvent("Claude Code run completed");
    this.emitSnapshot();
  }

  private updateSource(id: string, patch: Partial<SourceDescriptor>): void {
    const current = this.sources.get(id);
    if (!current) {
      return;
    }

    this.sources.set(id, { ...current, ...patch });
    this.emitSnapshot();
  }

  private pushBusEvent(value: string): void {
    this.busEvents.unshift(value);
    this.busEvents.splice(10);
  }

  private pushMessage(message: AppMessage): void {
    this.touchConversation(message.conversationId, message.conversationTitle);
    this.messages.unshift(message);
    this.messages.splice(150);
  }

  private ensureConversation(conversationId: string | undefined, fallbackTitle: string): ConversationSummary {
    const id = conversationId ?? "master";
    const existing = this.conversations.get(id);
    if (existing) {
      return existing;
    }

    const summary: ConversationSummary = {
      id,
      title: fallbackTitle,
      status: id === "master" ? "master" : "active",
      lastActivity: timestamp()
    };
    this.conversations.set(id, summary);
    return summary;
  }

  private touchConversation(id: string, title: string): void {
    const existing = this.conversations.get(id);
    if (existing) {
      this.conversations.set(id, {
        ...existing,
        title,
        lastActivity: timestamp()
      });
      return;
    }

    this.conversations.set(id, {
      id,
      title,
      status: id === "master" ? "master" : "active",
      lastActivity: timestamp()
    });
  }

  private emitSnapshot(): void {
    this.emit("snapshot", this.getSnapshot());
  }
}

function inferWorkspaceRoot(currentWorkingDirectory: string): string {
  if (currentWorkingDirectory.endsWith("/apps/mac")) {
    return resolve(currentWorkingDirectory, "..", "..");
  }

  return currentWorkingDirectory;
}

function safeMtime(filePath: string): number {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function listRecentJsonFiles(directory: string, limit: number): string[] {
  const results: Array<{ path: string; mtime: number }> = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(
        ...listRecentJsonFiles(fullPath, limit * 3).map((path) => ({
          path,
          mtime: safeMtime(path)
        }))
      );
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      results.push({ path: fullPath, mtime: safeMtime(fullPath) });
    }
  }

  return results
    .sort((left, right) => right.mtime - left.mtime)
    .slice(0, limit)
    .map((item) => item.path);
}

function findExecutable(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate.includes("/") && existsSync(candidate)) {
      return candidate;
    }

    const paths = (process.env.PATH ?? "").split(":").filter(Boolean);
    for (const pathEntry of paths) {
      const fullPath = join(pathEntry, candidate);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

function timestamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function spawnToString(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let output = "";
    const collect = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
    };

    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("exit", () => resolvePromise(output.trim()));
  });
}

function textToBlocks(text: string): MessageBlock[] {
  const normalized = text.trim();
  if (!normalized) {
    return [{ type: "markdown", text: "(empty response)" }];
  }

  const lines = normalized.split("\n");
  const blocks: MessageBlock[] = [];
  let markdownBuffer: string[] = [];
  let inCode = false;
  let codeLanguage = "";
  let codeBuffer: string[] = [];

  const flushMarkdown = (): void => {
    const value = markdownBuffer.join("\n").trim();
    if (value) {
      blocks.push({ type: "markdown", text: value });
    }
    markdownBuffer = [];
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (!inCode) {
        flushMarkdown();
        inCode = true;
        codeLanguage = line.replace(/^```/, "").trim() || "text";
        codeBuffer = [];
      } else {
        blocks.push({
          type: "code",
          language: codeLanguage,
          code: codeBuffer.join("\n").trim()
        });
        inCode = false;
        codeLanguage = "";
        codeBuffer = [];
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
    } else {
      markdownBuffer.push(line);
    }
  }

  if (codeBuffer.length > 0) {
    blocks.push({
      type: "code",
      language: codeLanguage || "text",
      code: codeBuffer.join("\n").trim()
    });
  }

  flushMarkdown();
  return blocks.length > 0 ? blocks : [{ type: "markdown", text: normalized }];
}
