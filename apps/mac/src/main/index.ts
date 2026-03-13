import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import { join } from "node:path";

import { BridgeManager } from "./bridge-manager.js";

const bridgeManager = new BridgeManager();

function createWindow(): void {
  nativeTheme.themeSource = "dark";

  const window = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1280,
    minHeight: 840,
    backgroundColor: "#0a0908",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 20, y: 18 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  bridgeManager.start();

  ipcMain.handle("verbum:get-snapshot", () => bridgeManager.getSnapshot());
  ipcMain.handle("verbum:send-message", (_event, request) => bridgeManager.sendMessage(request));
  ipcMain.handle("verbum:run-terminal", (_event, request) => bridgeManager.runTerminalCommand(request));
  ipcMain.handle("verbum:run-demo", () => bridgeManager.runLaunchDemo());
  ipcMain.handle("verbum:spawn-conversation", (_event, request) => bridgeManager.spawnConversation(request));

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

bridgeManager.on("snapshot", (snapshot) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("verbum:snapshot", snapshot);
  }
});
