import type {
  BridgeSnapshot,
  ConversationSummary,
  ContextPromptRequest,
  FileAttachment,
  MasterAgentState,
  RunTerminalRequest,
  SendMessageRequest,
  SetMasterAgentBackendRequest,
  SetupStatus,
  SpawnConversationRequest
} from "./message-schema";

declare global {
  interface Window {
    verbumApp: {
      platform: string;
      version: string;
      getSnapshot(): Promise<BridgeSnapshot>;
      sendMessage(request: SendMessageRequest): Promise<void>;
      sendContextPrompt(request: ContextPromptRequest): Promise<void>;
      setMasterAgentBackend(request: SetMasterAgentBackendRequest): Promise<MasterAgentState>;
      pickFiles(): Promise<FileAttachment[]>;
      runTerminalCommand(request: RunTerminalRequest): Promise<void>;
      runLaunchDemo(): Promise<void>;
      spawnConversation(request: SpawnConversationRequest): Promise<ConversationSummary>;
      getSetupStatus(): Promise<SetupStatus>;
      installCorePackage(): Promise<string>;
      installHelperService(): Promise<string>;
      subscribe(listener: (snapshot: BridgeSnapshot) => void): () => void;
    };
  }
}

declare module "*.png" {
  const src: string;
  export default src;
}

export {};
