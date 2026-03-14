export type SourceKind =
  | "orchestrator"
  | "claude-code"
  | "codex"
  | "terminal"
  | "memory"
  | "human"
  | "custom";

export type MasterAgentBackend = "claude-code" | "codex";

export type MessageBlock =
  | { type: "markdown"; text: string }
  | { type: "code"; language: string; code: string; filename?: string }
  | { type: "command"; command: string; output: string }
  | { type: "tool"; name: string; input: string; output: string; status: "running" | "done" }
  | { type: "status-list"; items: Array<{ label: string; value: string }> }
  | { type: "attachment-list"; items: FileAttachment[] };

export interface FileAttachment {
  path: string;
  name: string;
  size: number;
  mimeType: string;
  kind: "text" | "binary";
  preview?: string;
}

export interface SourceDescriptor {
  id: string;
  name: string;
  kind: SourceKind;
  subtitle: string;
  mode: "companion" | "replacement" | "custom";
  connected: boolean;
  typing: string;
  status: string;
  command?: string;
}

export interface AppMessage {
  id: string;
  conversationId: string;
  conversationTitle: string;
  sourceId: string;
  sourceLabel: string;
  sourceKind: SourceKind;
  role: "user" | "assistant" | "system" | "tool";
  title: string;
  timestamp: string;
  createdAt?: string;
  blocks: MessageBlock[];
}

export interface TerminalSession {
  id: string;
  title: string;
  cwd: string;
  lines: string[];
  lastCommand?: string;
}

export interface BridgeSnapshot {
  version: string;
  workspaceRoot: string;
  masterAgent: MasterAgentState;
  conversations: ConversationSummary[];
  sources: SourceDescriptor[];
  messages: AppMessage[];
  busEvents: string[];
  terminals: TerminalSession[];
  demoCommands: Array<{
    label: string;
    command: string;
    sessionId: string;
  }>;
}

export interface MasterAgentState {
  backend: MasterAgentBackend;
  backendLabel: string;
  modelLabel: string;
  status: string;
  responsibilities: string[];
}

export interface SetupStatus {
  nodeInstalled: boolean;
  npmInstalled: boolean;
  packageInstalled: boolean;
  packageVersion?: string;
  serviceInstalled: boolean;
  serviceRunning: boolean;
  serviceLabel: string;
  serviceStatusPath: string;
  gatekeeperWarning: boolean;
  claudeInstalled: boolean;
  codexInstalled: boolean;
}

export interface ConversationSummary {
  id: string;
  title: string;
  kind?: "master" | "side" | "imported";
  status: "master" | "active" | "background";
  lastActivity: string;
  sourceId?: string;
  sourceLabel?: string;
  externalThreadId?: string;
  cwd?: string;
}

export interface SendMessageRequest {
  routeTo: string;
  content: string;
  conversationId?: string;
  attachments?: FileAttachment[];
}

export interface ContextPromptRequest {
  routeTo: string;
  prompt: string;
  conversationId?: string;
  lookbackDays?: number;
  sourceIds?: string[];
  attachments?: FileAttachment[];
}

export interface RunTerminalRequest {
  sessionId: string;
  command: string;
  conversationId?: string;
}

export interface SpawnConversationRequest {
  title?: string;
}

export interface SetMasterAgentBackendRequest {
  backend: MasterAgentBackend;
}
