import { contextBridge, ipcRenderer } from "electron";

import type {
  BridgeSnapshot,
  RunTerminalRequest,
  SendMessageRequest,
  SpawnConversationRequest
} from "../shared/bridge-types.js";

contextBridge.exposeInMainWorld("verbumApp", {
  platform: process.platform,
  version: "0.1.0",
  getSnapshot: () => ipcRenderer.invoke("verbum:get-snapshot") as Promise<BridgeSnapshot>,
  sendMessage: (request: SendMessageRequest) => ipcRenderer.invoke("verbum:send-message", request),
  runTerminalCommand: (request: RunTerminalRequest) =>
    ipcRenderer.invoke("verbum:run-terminal", request),
  runLaunchDemo: () => ipcRenderer.invoke("verbum:run-demo"),
  spawnConversation: (request: SpawnConversationRequest) =>
    ipcRenderer.invoke("verbum:spawn-conversation", request),
  subscribe: (listener: (snapshot: BridgeSnapshot) => void) => {
    const wrapped = (_event: unknown, snapshot: BridgeSnapshot) => listener(snapshot);
    ipcRenderer.on("verbum:snapshot", wrapped);
    return () => ipcRenderer.removeListener("verbum:snapshot", wrapped);
  }
});
