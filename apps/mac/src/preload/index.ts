import { contextBridge, ipcRenderer } from "electron";

import type {
  BridgeSnapshot,
  ContextPromptRequest,
  FileAttachment,
  RunTerminalRequest,
  SendMessageRequest,
  SetMasterAgentBackendRequest,
  SetupStatus,
  SpawnConversationRequest
} from "../shared/bridge-types.js";

contextBridge.exposeInMainWorld("verbumApp", {
  platform: process.platform,
  version: "0.1.6",
  getSnapshot: () => ipcRenderer.invoke("verbum:get-snapshot") as Promise<BridgeSnapshot>,
  sendMessage: (request: SendMessageRequest) => ipcRenderer.invoke("verbum:send-message", request),
  sendContextPrompt: (request: ContextPromptRequest) =>
    ipcRenderer.invoke("verbum:send-context-prompt", request),
  setMasterAgentBackend: (request: SetMasterAgentBackendRequest) =>
    ipcRenderer.invoke("verbum:set-master-agent-backend", request),
  pickFiles: () => ipcRenderer.invoke("verbum:pick-files") as Promise<FileAttachment[]>,
  runTerminalCommand: (request: RunTerminalRequest) =>
    ipcRenderer.invoke("verbum:run-terminal", request),
  runLaunchDemo: () => ipcRenderer.invoke("verbum:run-demo"),
  spawnConversation: (request: SpawnConversationRequest) =>
    ipcRenderer.invoke("verbum:spawn-conversation", request),
  getSetupStatus: () => ipcRenderer.invoke("verbum:get-setup-status") as Promise<SetupStatus>,
  installCorePackage: () => ipcRenderer.invoke("verbum:install-core-package") as Promise<string>,
  installHelperService: () => ipcRenderer.invoke("verbum:install-helper-service") as Promise<string>,
  subscribe: (listener: (snapshot: BridgeSnapshot) => void) => {
    const wrapped = (_event: unknown, snapshot: BridgeSnapshot) => listener(snapshot);
    ipcRenderer.on("verbum:snapshot", wrapped);
    return () => ipcRenderer.removeListener("verbum:snapshot", wrapped);
  }
});
