import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, watch, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";

import type {
  AppMessage,
  BridgeSnapshot,
  ConversationSummary,
  ContextPromptRequest,
  FileAttachment,
  MessageBlock,
  RunTerminalRequest,
  SendMessageRequest,
  SetupStatus,
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

interface CodexSessionIndexEntry {
  id?: string;
  thread_name?: string;
  updated_at?: string;
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
  private readonly verbumConfigDir = join(homedir(), ".config", "verbum");
  private readonly serviceLabel = "ai.verbum.helper";
  private readonly serviceScriptPath = join(homedir(), ".config", "verbum", "helper.mjs");
  private readonly serviceStatusPath = join(homedir(), ".config", "verbum", "helper-status.json");
  private readonly serviceLogPath = join(homedir(), ".config", "verbum", "helper.log");
  private readonly servicePlistPath = join(homedir(), "Library", "LaunchAgents", "ai.verbum.helper.plist");
  private readonly claudeTasksDir = join(homedir(), ".claude", "tasks");
  private readonly codexSessionIndexPath = join(homedir(), ".codex", "session_index.jsonl");
  private readonly codexSessionsDir = join(homedir(), ".codex", "sessions");
  private readonly conversations = new Map<string, ConversationSummary>();
  private readonly sources = new Map<string, SourceDescriptor>();
  private readonly messages: AppMessage[] = [];
  private readonly busEvents: string[] = [];
  private readonly terminals = new Map<string, TerminalSession>();
  private readonly processedClaudeFiles = new Set<string>();
  private readonly attachedClaudeThreads = new Set<string>();
  private readonly codexThreadNames = new Map<string, string>();
  private readonly codexProcessedLineCounts = new Map<string, number>();
  private readonly attachedCodexSessions = new Set<string>();
  private customSourceProcessesStarted = false;
  private codexPollingTimer?: NodeJS.Timeout;

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
    this.startCodexSessionWatcher();
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
          command: "npm test --workspace packages/verbum",
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

  readAttachments(filePaths: string[]): FileAttachment[] {
    return filePaths.flatMap((filePath) => {
      try {
        const size = statSync(filePath).size;
        const kind = isTextLikeFile(filePath) ? "text" : "binary";
        const preview =
          kind === "text"
            ? readFileSync(filePath, "utf8").slice(0, 12000)
            : undefined;

        return [{
          path: filePath,
          name: filePath.split("/").at(-1) ?? filePath,
          size,
          mimeType: inferMimeType(filePath),
          kind,
          preview
        }];
      } catch {
        return [];
      }
    });
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
      blocks: buildPromptBlocks(content, request.attachments)
    });

    await this.dispatchRoute(request.routeTo, injectAttachmentsIntoPrompt(content, request.attachments), conversation);
  }

  async sendContextPrompt(request: ContextPromptRequest): Promise<void> {
    const prompt = request.prompt.trim();
    const conversation = this.ensureConversation(request.conversationId, "Master");
    if (!prompt) {
      return;
    }

    const contextPack = this.buildContextPack({
      lookbackDays: request.lookbackDays ?? 7,
      sourceIds: request.sourceIds
    });

    this.pushMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      sourceId: "inbox",
      sourceLabel: "Inbox",
      sourceKind: "human",
      role: "user",
      title: "Cross-thread prompt",
      timestamp: timestamp(),
      blocks: buildPromptBlocks(prompt, request.attachments)
    });

    this.pushMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      sourceId: "verbum-app",
      sourceLabel: "Verbum App",
      sourceKind: "custom",
      role: "system",
      title: "Cross-thread context attached",
      timestamp: timestamp(),
      blocks: [
        {
          type: "status-list",
          items: [
            { label: "Window", value: `Last ${contextPack.lookbackDays} days` },
            { label: "Messages", value: String(contextPack.messageCount) },
            { label: "Threads", value: String(contextPack.conversationCount) },
            { label: "Sources", value: contextPack.sources.join(", ") || "all" }
          ]
        },
        {
          type: "markdown",
          text: contextPack.threadTitles.length > 0
            ? `Included threads: ${contextPack.threadTitles.slice(0, 8).join(", ")}`
            : "No imported threads were found for the selected window."
        }
      ]
    });

    await this.dispatchRoute(
      request.routeTo,
      [
        prompt,
        "",
        "Use the Verbum cross-thread context below as authoritative machine history.",
        "Reference concrete accomplishments, loose ends, next steps, and unresolved questions.",
        "",
        injectAttachmentsIntoPrompt(contextPack.content, request.attachments)
      ].join("\n"),
      conversation
    );
  }

  private async dispatchRoute(
    routeTo: string,
    content: string,
    conversation: ConversationSummary
  ): Promise<void> {
    if (routeTo === "claude-code") {
      await this.sendToClaude(content, conversation);
      return;
    }

    if (routeTo === "codex") {
      await this.sendToCodex(content, conversation);
      return;
    }

    if (routeTo === "shell-1" || routeTo === "shell-2") {
      await this.runTerminalCommand({
        sessionId: routeTo,
        command: content,
        conversationId: conversation.id
      });
      return;
    }

    this.pushMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      sourceId: routeTo,
      sourceLabel: this.sources.get(routeTo)?.name ?? routeTo,
      sourceKind: this.sources.get(routeTo)?.kind ?? "custom",
      role: "system",
      title: "Route accepted",
      timestamp: timestamp(),
      blocks: [
        {
          type: "markdown",
          text: `Verbum recorded your message for \`${routeTo}\`. That source does not implement direct prompting yet, but it can still stream observed events into the app.`
        }
      ]
    });

    this.emitSnapshot();
  }

  private buildContextPack(config: {
    lookbackDays: number;
    sourceIds?: string[];
  }): {
    lookbackDays: number;
    messageCount: number;
    conversationCount: number;
    sources: string[];
    threadTitles: string[];
    content: string;
  } {
    const cutoff = Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000;
    const allowedSources = new Set(
      (config.sourceIds?.length ? config.sourceIds : ["claude-code", "codex", "shell-1", "shell-2", "inbox", "verbum-app"])
    );
    const filtered = this.messages.filter((message) => {
      if (!allowedSources.has(message.sourceId)) {
        return false;
      }

      const createdAt = message.createdAt ? new Date(message.createdAt).getTime() : Date.now();
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    });

    const byConversation = new Map<string, AppMessage[]>();
    for (const message of filtered) {
      const bucket = byConversation.get(message.conversationId) ?? [];
      bucket.push(message);
      byConversation.set(message.conversationId, bucket);
    }

    const conversationLines = [...byConversation.entries()]
      .sort((left, right) => {
        const leftTime = new Date(left[1][0]?.createdAt ?? 0).getTime();
        const rightTime = new Date(right[1][0]?.createdAt ?? 0).getTime();
        return rightTime - leftTime;
      })
      .slice(0, 16)
      .map(([conversationId, messages]) => {
        const summary = this.conversations.get(conversationId);
        const header = `## ${summary?.title ?? conversationId} (${summary?.sourceLabel ?? "Verbum"})`;
        const items = messages
          .slice(0, 10)
          .reverse()
          .map((message) => {
            const preview = summarizeBlocks(message.blocks);
            return `- [${message.timestamp}] ${message.sourceLabel} ${message.role}: ${preview}`;
          });
        return [header, ...items].join("\n");
      });

    const threadTitles = [...byConversation.keys()]
      .map((conversationId) => this.conversations.get(conversationId)?.title ?? conversationId);

    return {
      lookbackDays: config.lookbackDays,
      messageCount: filtered.length,
      conversationCount: byConversation.size,
      sources: [...allowedSources].map((sourceId) => this.sources.get(sourceId)?.name ?? sourceId),
      threadTitles,
      content: [
        `Context window: last ${config.lookbackDays} days`,
        `Included sources: ${[...allowedSources].map((sourceId) => this.sources.get(sourceId)?.name ?? sourceId).join(", ")}`,
        "",
        ...conversationLines
      ].join("\n")
    };
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
      kind: "side",
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
      command: "npm test --workspace packages/verbum"
    });
    await this.runTerminalCommand({
      conversationId: conversation.id,
      sessionId: "shell-2",
      command: "find ~/.claude/tasks -maxdepth 2 -type f | head -n 6"
    });
  }

  getSetupStatus(): SetupStatus {
    const nodeBinary = findExecutable(["node", "/opt/homebrew/bin/node", "/usr/local/bin/node"]);
    const npmBinary = findExecutable(["npm", "/opt/homebrew/bin/npm", "/usr/local/bin/npm"]);
    const claudeBinary = this.sources.get("claude-code")?.command ?? findExecutable(["claude", "/opt/homebrew/bin/claude"]);
    const codexBinary = this.sources.get("codex")?.command ?? findExecutable(["codex", "/opt/homebrew/bin/codex"]);
    const packageVersion = npmBinary ? readGlobalPackageVersion(npmBinary, "verbum-ai") : null;

    return {
      nodeInstalled: Boolean(nodeBinary),
      npmInstalled: Boolean(npmBinary),
      packageInstalled: Boolean(packageVersion),
      packageVersion: packageVersion ?? undefined,
      serviceInstalled: existsSync(this.serviceScriptPath) && existsSync(this.servicePlistPath),
      serviceRunning: isLaunchAgentRunning(this.serviceLabel),
      serviceLabel: this.serviceLabel,
      serviceStatusPath: this.serviceStatusPath,
      gatekeeperWarning: true,
      claudeInstalled: Boolean(claudeBinary),
      codexInstalled: Boolean(codexBinary)
    };
  }

  async installCorePackage(): Promise<string> {
    const npmBinary = findExecutable(["npm", "/opt/homebrew/bin/npm", "/usr/local/bin/npm"]);
    if (!npmBinary) {
      throw new Error("npm is not installed on this machine.");
    }

    const output = await spawnToString(npmBinary, ["install", "-g", "verbum-ai"], this.workspaceRoot);
    this.pushBusEvent("Installed verbum-ai globally");
    this.emitSnapshot();
    return output || "Installed verbum-ai globally.";
  }

  async installHelperService(): Promise<string> {
    const nodeBinary = findExecutable(["node", "/opt/homebrew/bin/node", "/usr/local/bin/node"]);
    if (!nodeBinary) {
      throw new Error("Node.js is required before Verbum can install its helper service.");
    }

    mkdirSync(this.verbumConfigDir, { recursive: true });
    mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });

    writeFileSync(this.serviceScriptPath, helperScriptContents(this.serviceStatusPath), "utf8");
    writeFileSync(this.servicePlistPath, launchAgentPlistContents({
      label: this.serviceLabel,
      nodeBinary,
      scriptPath: this.serviceScriptPath,
      logPath: this.serviceLogPath
    }), "utf8");

    const uid = currentUid();
    runLaunchctl(["bootout", `gui/${uid}`, this.servicePlistPath]);
    runLaunchctl(["bootstrap", `gui/${uid}`, this.servicePlistPath]);
    runLaunchctl(["kickstart", "-k", `gui/${uid}/${this.serviceLabel}`]);

    this.pushBusEvent("Installed Verbum helper service");
    this.emitSnapshot();
    return `Installed and started ${this.serviceLabel}.`;
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
      kind: "master",
      status: "master",
      lastActivity: timestamp(),
      sourceId: "verbum-app",
      sourceLabel: "Verbum App"
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
    const codexDesktopSessions = existsSync(this.codexSessionIndexPath) || existsSync(this.codexSessionsDir);

    this.updateSource("claude-code", {
      connected: Boolean(claude),
      status: claude ? "connected" : "not installed",
      command: claude ?? undefined
    });
    this.updateSource("codex", {
      connected: Boolean(codex) || codexDesktopSessions,
      status: codexDesktopSessions
        ? codex
          ? "watching desktop + cli"
          : "watching desktop"
        : codex
          ? "connected"
          : "not installed",
      command: codex ?? undefined
    });

    if (claude) {
      this.pushBusEvent("Claude Code detected");
    }

    if (codex) {
      this.pushBusEvent("Codex detected");
    }

    if (codexDesktopSessions) {
      this.pushBusEvent("Codex desktop sessions detected");
    }
  }

  private startClaudeTaskWatcher(): void {
    if (!existsSync(this.claudeTasksDir)) {
      return;
    }

    let importedCount = 0;
    for (const file of listRecentJsonFiles(this.claudeTasksDir, 24)) {
      importedCount += this.ingestClaudeTaskFile(file);
    }

    if (importedCount > 0) {
      this.updateSource("claude-code", {
        connected: true,
        status: `watching ${importedCount} thread${importedCount === 1 ? "" : "s"}`
      });
    }

    watch(
      this.claudeTasksDir,
      { recursive: true },
      (_eventType, filename) => {
        if (!filename || !filename.endsWith(".json")) {
          return;
        }

        const imported = this.ingestClaudeTaskFile(join(this.claudeTasksDir, filename));
        if (imported > 0) {
          this.updateSource("claude-code", {
            connected: true,
            status: `watching ${this.attachedClaudeThreads.size} thread${this.attachedClaudeThreads.size === 1 ? "" : "s"}`
          });
        }
      }
    );
  }

  private startCodexSessionWatcher(): void {
    if (!existsSync(this.codexSessionIndexPath) && !existsSync(this.codexSessionsDir)) {
      return;
    }

    this.refreshCodexSessionIndex();
    this.ingestRecentCodexSessions();

    this.codexPollingTimer = setInterval(() => {
      this.refreshCodexSessionIndex();
      this.ingestRecentCodexSessions();
    }, 1600);
  }

  private refreshCodexSessionIndex(): void {
    if (!existsSync(this.codexSessionIndexPath)) {
      return;
    }

    try {
      const lines = readFileSync(this.codexSessionIndexPath, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        const entry = JSON.parse(line) as CodexSessionIndexEntry;
        if (!entry.id) {
          continue;
        }

        this.codexThreadNames.set(entry.id, entry.thread_name?.trim() || `Codex thread ${entry.id.slice(0, 8)}`);
      }
    } catch {
      // Ignore partial writes in the index file.
    }
  }

  private ingestRecentCodexSessions(): void {
    if (!existsSync(this.codexSessionsDir)) {
      return;
    }

    const recentFiles = listRecentFilesByExtension(this.codexSessionsDir, ".jsonl", 10);
    let importedCount = 0;

    for (const filePath of recentFiles) {
      importedCount += this.ingestCodexSessionFile(filePath);
    }

    if (recentFiles.length > 0) {
      this.updateSource("codex", {
        connected: true,
        status: importedCount > 0 ? `watching ${importedCount} thread${importedCount === 1 ? "" : "s"}` : "watching desktop"
      });
    }
  }

  private ingestCodexSessionFile(filePath: string): number {
    if (!existsSync(filePath)) {
      return 0;
    }

    try {
      const raw = readFileSync(filePath, "utf8");
      const lines = raw.split("\n");
      const completeLineCount = raw.endsWith("\n") ? lines.length : Math.max(0, lines.length - 1);
      const previousCount = this.codexProcessedLineCounts.get(filePath);
      const start = previousCount ?? Math.max(0, completeLineCount - 120);

      for (let index = start; index < completeLineCount; index += 1) {
        const line = lines[index]?.trim();
        if (!line) {
          continue;
        }

        this.ingestCodexSessionLine(filePath, line);
      }

      this.codexProcessedLineCounts.set(filePath, completeLineCount);
      return this.attachedCodexSessions.has(codexConversationId(inferCodexSessionId(filePath))) ? 1 : 0;
    } catch {
      return 0;
    }
  }

  private ingestCodexSessionLine(filePath: string, line: string): void {
    try {
      const event = JSON.parse(line) as {
        timestamp?: string;
        type?: string;
        payload?: Record<string, unknown>;
      };
      const sessionId = inferCodexSessionId(filePath);
      if (!sessionId) {
        return;
      }

      if (event.type === "session_meta") {
        const payload = (event.payload ?? {}) as {
          id?: string;
          cwd?: string;
          originator?: string;
          source?: string;
        };
        const actualSessionId = payload.id ?? sessionId;
        const threadTitle =
          this.codexThreadNames.get(actualSessionId) ?? `Codex thread ${actualSessionId.slice(0, 8)}`;
        const conversationId = codexConversationId(actualSessionId);

        this.ensureConversation(conversationId, threadTitle, {
          kind: "imported",
          status: "background",
          sourceId: "codex",
          sourceLabel: "Codex",
          externalThreadId: actualSessionId,
          cwd: payload.cwd
        });

        if (!this.attachedCodexSessions.has(conversationId)) {
          this.attachedCodexSessions.add(conversationId);
          this.pushBusEvent(`Codex thread attached: ${threadTitle}`);
          this.pushMessage({
            id: randomUUID(),
            conversationId,
            conversationTitle: threadTitle,
            sourceId: "codex",
            sourceLabel: "Codex",
            sourceKind: "codex",
            role: "system",
            title: "Codex thread attached",
            timestamp: timestamp(),
            createdAt: normalizeCreatedAt(event.timestamp),
            blocks: [
              {
                type: "status-list",
                items: [
                  { label: "Thread", value: actualSessionId },
                  { label: "Workspace", value: payload.cwd ?? this.workspaceRoot },
                  { label: "Origin", value: `${payload.originator ?? "Codex"} · ${payload.source ?? "desktop"}` }
                ]
              }
            ]
          });
        }
        return;
      }

      const conversationId = codexConversationId(sessionId);
      const conversation =
        this.ensureConversation(conversationId, this.codexThreadNames.get(sessionId) ?? `Codex thread ${sessionId.slice(0, 8)}`, {
          kind: "imported",
          status: "background",
          sourceId: "codex",
          sourceLabel: "Codex",
          externalThreadId: sessionId
        });
      const eventTimestamp = formatLogTimestamp(event.timestamp);
      const eventCreatedAt = normalizeCreatedAt(event.timestamp);

      if (event.type === "response_item") {
        this.ingestCodexResponseItem(event.payload ?? {}, conversation, eventTimestamp, eventCreatedAt);
        return;
      }

      if (event.type === "event_msg") {
        this.ingestCodexEventMessage(event.payload ?? {}, conversation, eventTimestamp, eventCreatedAt);
      }
    } catch {
      // Ignore partial writes.
    }
  }

  private ingestClaudeTaskFile(filePath: string): number {
    if (!filePath.endsWith(".json") || !existsSync(filePath)) {
      return 0;
    }

    const fileKey = `${filePath}:${safeMtime(filePath)}`;
    if (this.processedClaudeFiles.has(fileKey)) {
      return 0;
    }

    try {
      const task = JSON.parse(readFileSync(filePath, "utf8")) as ClaudeTaskFile;
      const taskCreatedAt = isoFromMtime(filePath);
      this.processedClaudeFiles.add(fileKey);
      const threadId = inferClaudeThreadId(filePath);
      const conversationId = claudeConversationId(threadId);
      const conversationTitle =
        task.subject?.trim() ||
        task.activeForm?.trim() ||
        (threadId ? `Claude thread ${threadId.slice(0, 8)}` : "Claude Code");
      const conversation = this.ensureConversation(conversationId, conversationTitle, {
        kind: "imported",
        status: "background",
        sourceId: "claude-code",
        sourceLabel: "Claude Code",
        externalThreadId: threadId ?? undefined
      });

      if (threadId && !this.attachedClaudeThreads.has(conversationId)) {
        this.attachedClaudeThreads.add(conversationId);
        this.pushBusEvent(`Claude thread attached: ${conversation.title}`);
        this.pushMessage({
          id: randomUUID(),
          conversationId: conversation.id,
          conversationTitle: conversation.title,
          sourceId: "claude-code",
          sourceLabel: "Claude Code",
          sourceKind: "claude-code",
          role: "system",
          title: "Claude thread attached",
          timestamp: timestamp(),
          createdAt: taskCreatedAt,
          blocks: [
            {
              type: "status-list",
              items: [
                { label: "Thread", value: threadId },
                { label: "Source", value: "Claude task watcher" }
              ]
            }
          ]
        });
      }

      this.pushMessage({
        id: randomUUID(),
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        sourceId: "claude-code",
        sourceLabel: "Claude Code",
        sourceKind: "claude-code",
        role: "system",
        title: task.subject ?? "Claude task update",
        timestamp: timestamp(),
        createdAt: taskCreatedAt,
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
      return this.attachedClaudeThreads.has(conversationId) ? 1 : 0;
    } catch {
      // Ignore partial writes or non-task files.
      return 0;
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

  private ingestCodexResponseItem(
    payload: Record<string, unknown>,
    conversation: ConversationSummary,
    eventTimestamp: string,
    eventCreatedAt: string
  ): void {
    const itemType = typeof payload.type === "string" ? payload.type : "";

    if (itemType === "message") {
      const role = typeof payload.role === "string" ? payload.role : "assistant";
      if (role !== "user" && role !== "assistant") {
        return;
      }

      const text = codexContentToText(payload.content);
      if (!text.trim()) {
        return;
      }

      this.pushMessage({
        id: randomUUID(),
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        sourceId: "codex",
        sourceLabel: "Codex",
        sourceKind: "codex",
        role,
        title: role === "user" ? "Codex prompt" : "Codex reply",
        timestamp: eventTimestamp,
        createdAt: eventCreatedAt,
        blocks: textToBlocks(text)
      });
      this.emitSnapshot();
      return;
    }

    if (itemType === "function_call" || itemType === "custom_tool_call") {
      const toolName = typeof payload.name === "string" ? payload.name : "tool";
      const input =
        typeof payload.arguments === "string"
          ? payload.arguments
          : typeof payload.input === "string"
            ? payload.input
            : JSON.stringify(payload.input ?? payload.arguments ?? {}, null, 2);

      this.pushMessage({
        id: randomUUID(),
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        sourceId: "codex",
        sourceLabel: "Codex",
        sourceKind: "codex",
        role: "tool",
        title: `Codex tool: ${toolName}`,
        timestamp: eventTimestamp,
        createdAt: eventCreatedAt,
        blocks: [
          {
            type: "tool",
            name: toolName,
            input,
            output: "Running...",
            status: "running"
          }
        ]
      });
      this.emitSnapshot();
      return;
    }

    if (itemType === "function_call_output" || itemType === "custom_tool_call_output") {
      const output =
        typeof payload.output === "string" ? payload.output : JSON.stringify(payload.output ?? {}, null, 2);

      this.pushMessage({
        id: randomUUID(),
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        sourceId: "codex",
        sourceLabel: "Codex",
        sourceKind: "codex",
        role: "tool",
        title: "Codex tool output",
        timestamp: eventTimestamp,
        createdAt: eventCreatedAt,
        blocks: [
          {
            type: "command",
            command: "tool_result",
            output
          }
        ]
      });
      this.emitSnapshot();
    }
  }

  private ingestCodexEventMessage(
    payload: Record<string, unknown>,
    conversation: ConversationSummary,
    eventTimestamp: string,
    eventCreatedAt: string
  ): void {
    const eventType = typeof payload.type === "string" ? payload.type : "";
    if (!eventType || eventType === "token_count") {
      return;
    }

    if (eventType === "agent_message" || eventType === "user_message") {
      return;
    }

    const detail = extractCodexEventDetail(payload);
    if (!detail) {
      return;
    }

    this.pushMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      sourceId: "codex",
      sourceLabel: "Codex",
      sourceKind: "codex",
      role: "system",
      title: titleCaseEventLabel(eventType),
      timestamp: eventTimestamp,
      createdAt: eventCreatedAt,
      blocks: [{ type: "markdown", text: detail }]
    });
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
    const nextMessage = {
      ...message,
      createdAt: message.createdAt ?? new Date().toISOString()
    };
    this.touchConversation(nextMessage.conversationId, nextMessage.conversationTitle);
    this.messages.unshift(nextMessage);
    this.messages.splice(150);
  }

  private ensureConversation(
    conversationId: string | undefined,
    fallbackTitle: string,
    patch: Partial<ConversationSummary> = {}
  ): ConversationSummary {
    const id = conversationId ?? "master";
    const existing = this.conversations.get(id);
    if (existing) {
      const next = { ...existing, ...patch };
      this.conversations.set(id, next);
      return next;
    }

    const summary: ConversationSummary = {
      id,
      title: fallbackTitle,
      kind: id === "master" ? "master" : "side",
      status: id === "master" ? "master" : "active",
      lastActivity: timestamp(),
      ...patch
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
      kind: id === "master" ? "master" : "side",
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
  return listRecentFilesByExtension(directory, ".json", limit);
}

function listRecentFilesByExtension(directory: string, extension: string, limit: number): string[] {
  const results: Array<{ path: string; mtime: number }> = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(
        ...listRecentFilesByExtension(fullPath, extension, limit * 3).map((path) => ({
          path,
          mtime: safeMtime(path)
        }))
      );
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(extension)) {
      results.push({ path: fullPath, mtime: safeMtime(fullPath) });
    }
  }

  return results
    .sort((left, right) => right.mtime - left.mtime)
    .slice(0, limit)
    .map((item) => item.path);
}

function inferCodexSessionId(filePath: string): string | null {
  const match = filePath.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i);
  return match?.[1] ?? null;
}

function inferClaudeThreadId(filePath: string): string | null {
  const match = filePath.match(/\/tasks\/([0-9a-f-]{36})\//i);
  return match?.[1] ?? null;
}

function claudeConversationId(threadId: string | null): string {
  return `claude:${threadId ?? "unknown"}`;
}

function codexConversationId(sessionId: string | null): string {
  return `codex:${sessionId ?? "unknown"}`;
}

function formatLogTimestamp(value: string | undefined): string {
  if (!value) {
    return timestamp();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp();
  }

  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeCreatedAt(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function isoFromMtime(filePath: string): string {
  const mtime = safeMtime(filePath);
  return mtime > 0 ? new Date(mtime).toISOString() : new Date().toISOString();
}

function isTextLikeFile(filePath: string): boolean {
  const extension = filePath.split(".").pop()?.toLowerCase();
  return new Set([
    "md",
    "txt",
    "json",
    "ts",
    "tsx",
    "js",
    "jsx",
    "py",
    "rb",
    "go",
    "rs",
    "yml",
    "yaml",
    "html",
    "css",
    "csv",
    "sh"
  ]).has(extension ?? "");
}

function inferMimeType(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    md: "text/markdown",
    txt: "text/plain",
    json: "application/json",
    ts: "text/typescript",
    tsx: "text/typescript",
    js: "text/javascript",
    jsx: "text/javascript",
    py: "text/x-python",
    rb: "text/x-ruby",
    go: "text/x-go",
    rs: "text/rust",
    yml: "text/yaml",
    yaml: "text/yaml",
    html: "text/html",
    css: "text/css",
    csv: "text/csv",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg"
  };

  return types[extension ?? ""] ?? "application/octet-stream";
}

function codexContentToText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }

      const candidate = part as { text?: unknown; type?: unknown };
      if (typeof candidate.text === "string") {
        return candidate.text;
      }

      if (typeof candidate.type === "string") {
        return `[${candidate.type}]`;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function extractCodexEventDetail(payload: Record<string, unknown>): string | null {
  for (const key of ["message", "text", "title", "summary"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const info = payload.info;
  if (info && typeof info === "object") {
    const serialized = JSON.stringify(info, null, 2);
    return serialized === "{}" ? null : serialized;
  }

  return null;
}

function titleCaseEventLabel(value: string): string {
  return value
    .split(/[_\-.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function summarizeBlocks(blocks: MessageBlock[]): string {
  const parts = blocks
    .map((block) => {
      switch (block.type) {
        case "markdown":
          return block.text;
        case "code":
          return `${block.filename ?? block.language} code block`;
        case "command":
          return `${block.command}: ${block.output.split("\n").slice(0, 2).join(" ")}`;
        case "tool":
          return `${block.name} ${block.status}: ${block.output}`;
        case "status-list":
          return block.items.map((item) => `${item.label} ${item.value}`).join(", ");
        case "attachment-list":
          return block.items.map((item) => item.name).join(", ");
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join(" | ")
    .replace(/\s+/g, " ")
    .trim();

  return parts.length > 220 ? `${parts.slice(0, 217)}...` : parts || "(no content)";
}

function buildPromptBlocks(prompt: string, attachments?: FileAttachment[]): MessageBlock[] {
  const blocks: MessageBlock[] = [{ type: "markdown", text: prompt }];
  if (attachments && attachments.length > 0) {
    blocks.push({
      type: "attachment-list",
      items: attachments
    });
  }
  return blocks;
}

function injectAttachmentsIntoPrompt(prompt: string, attachments?: FileAttachment[]): string {
  if (!attachments || attachments.length === 0) {
    return prompt;
  }

  const attachmentSections = attachments.map((attachment) => {
    const header = `Attachment: ${attachment.name} (${attachment.mimeType}, ${attachment.size} bytes)`;
    if (attachment.kind === "text" && attachment.preview) {
      return [header, "```", attachment.preview, "```"].join("\n");
    }

    return [header, `Binary file at ${attachment.path}`].join("\n");
  });

  return [prompt, "", "Attached files:", ...attachmentSections].join("\n\n");
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

function readGlobalPackageVersion(npmBinary: string, packageName: string): string | null {
  try {
    const output = execFileSync(npmBinary, ["ls", "-g", packageName, "--json", "--depth=0"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const parsed = JSON.parse(output) as {
      dependencies?: Record<string, { version?: string }>;
    };
    return parsed.dependencies?.[packageName]?.version ?? null;
  } catch {
    return null;
  }
}

function isLaunchAgentRunning(label: string): boolean {
  try {
    execFileSync("launchctl", ["print", `gui/${currentUid()}/${label}`], {
      stdio: ["ignore", "ignore", "ignore"]
    });
    return true;
  } catch {
    return false;
  }
}

function currentUid(): number {
  return typeof process.getuid === "function" ? process.getuid() : 501;
}

function runLaunchctl(args: string[]): void {
  try {
    execFileSync("launchctl", args, {
      stdio: ["ignore", "ignore", "ignore"]
    });
  } catch {
    // Ignore bootout/start failures and let the status check surface the result.
  }
}

function helperScriptContents(statusPath: string): string {
  return `import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const statusPath = ${JSON.stringify(statusPath)};
const claudePaths = ["${homedir()}/.claude", "${homedir()}/.claude/tasks"];
const codexPaths = ["${homedir()}/.codex", "${homedir()}/.codex/sessions"];

function writeStatus() {
  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(
    statusPath,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        pid: process.pid,
        claudeConfigured: claudePaths.some((value) => existsSync(value)),
        codexConfigured: codexPaths.some((value) => existsSync(value))
      },
      null,
      2
    )
  );
}

writeStatus();
setInterval(writeStatus, 15000);
`;
}

function launchAgentPlistContents(config: {
  label: string;
  nodeBinary: string;
  scriptPath: string;
  logPath: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${config.label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${config.nodeBinary}</string>
    <string>${config.scriptPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${config.logPath}</string>
  <key>StandardErrorPath</key>
  <string>${config.logPath}</string>
</dict>
</plist>
`;
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
