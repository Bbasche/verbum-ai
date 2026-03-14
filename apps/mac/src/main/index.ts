import { app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme } from "electron";
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
    backgroundColor: "#18130f",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 20, y: 18 },
    icon: join(process.cwd(), "apps/mac/build/icon.png"),
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
  const dockIcon = nativeImage.createFromPath(join(process.cwd(), "apps/mac/build/icon.png"));
  if (!dockIcon.isEmpty() && process.platform === "darwin" && app.dock) {
    app.dock.setIcon(dockIcon);
  }

  bridgeManager.start();

  ipcMain.handle("verbum:get-snapshot", () => bridgeManager.getSnapshot());
  ipcMain.handle("verbum:get-setup-status", () => bridgeManager.getSetupStatus());
  ipcMain.handle("verbum:send-message", (_event, request) => bridgeManager.sendMessage(request));
  ipcMain.handle("verbum:send-context-prompt", (_event, request) => bridgeManager.sendContextPrompt(request));
  ipcMain.handle("verbum:set-master-agent-backend", (_event, request) =>
    bridgeManager.setMasterAgentBackend(request)
  );
  ipcMain.handle("verbum:pick-files", async () => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Documents",
          extensions: ["md", "txt", "json", "ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "yml", "yaml", "html", "css", "csv"]
        },
        { name: "All files", extensions: ["*"] }
      ]
    });
    if (result.canceled) {
      return [];
    }
    return bridgeManager.readAttachments(result.filePaths);
  });
  ipcMain.handle("verbum:run-terminal", (_event, request) => bridgeManager.runTerminalCommand(request));
  ipcMain.handle("verbum:run-demo", () => bridgeManager.runLaunchDemo());
  ipcMain.handle("verbum:spawn-conversation", (_event, request) => bridgeManager.spawnConversation(request));
  ipcMain.handle("verbum:install-core-package", () => bridgeManager.installCorePackage());
  ipcMain.handle("verbum:install-helper-service", () => bridgeManager.installHelperService());

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
