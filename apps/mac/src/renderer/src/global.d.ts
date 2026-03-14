import type {
  BridgeSnapshot,
  ConversationSummary,
  ContextPromptRequest,
  RunTerminalRequest,
  SendMessageRequest,
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
