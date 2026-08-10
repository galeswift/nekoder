import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { IPC_CHANNELS, type QueueEncodeItem } from "../src/ipc/api";
import { nodeProcessRunner } from "./nodeProcessRunner";
import { chooseOutputFolderDialog, openFilesDialog, openFolderDialog, resolveOutputPath } from "./ipc/files";
import type { ResolveOutputPathRequest } from "../src/ipc/api";
import { browseForExecutable, checkFfmpegTools, probeMediaFile } from "./ipc/media";
import { loadSettings, saveSettings } from "./ipc/settings";
import { cancelCurrentEncode, startEncodeQueue } from "./ipc/encoding";
import { parseSettings } from "../src/settings/types";
import { locateTool } from "../src/media/toolLocator";

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | undefined;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    void mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.openFiles, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow!;
    return openFilesDialog(window);
  });

  ipcMain.handle(IPC_CHANNELS.openFolder, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow!;
    return openFolderDialog(window);
  });

  ipcMain.handle(IPC_CHANNELS.chooseOutputFolder, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow!;
    return chooseOutputFolderDialog(window);
  });

  ipcMain.handle(IPC_CHANNELS.resolveOutputPath, (_event, request: ResolveOutputPathRequest) => {
    return resolveOutputPath(request);
  });

  ipcMain.handle(IPC_CHANNELS.probeMedia, async (_event, filePath: string) => {
    const settings = await loadSettings();
    const ffprobe = await locateTool(nodeProcessRunner, [settings.ffprobePath, "ffprobe"]);
    if (!ffprobe) {
      return { ok: false, error: "ffprobe was not found. Check the tool paths in Settings." };
    }
    return probeMediaFile(nodeProcessRunner, ffprobe.path, filePath);
  });

  ipcMain.handle(IPC_CHANNELS.checkFfmpegTools, async () => {
    const settings = await loadSettings();
    return checkFfmpegTools(nodeProcessRunner, settings);
  });

  ipcMain.handle(IPC_CHANNELS.browseForExecutable, (event, kind: "ffmpeg" | "ffprobe") => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow!;
    return browseForExecutable(window, kind);
  });

  ipcMain.handle(IPC_CHANNELS.startEncode, async (event, items: QueueEncodeItem[]) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow!;
    const settings = await loadSettings();
    const ffmpeg = await locateTool(nodeProcessRunner, [settings.ffmpegPath, "ffmpeg"]);
    if (!ffmpeg) {
      for (const item of items) {
        window.webContents.send(IPC_CHANNELS.encodeStatus, {
          id: item.id,
          status: "error",
          error: "ffmpeg was not found. Check the tool paths in Settings.",
        });
      }
      return;
    }
    await startEncodeQueue(window, ffmpeg.path, items);
  });

  ipcMain.handle(IPC_CHANNELS.cancelEncode, (_event, id: string) => {
    cancelCurrentEncode(id);
  });

  ipcMain.handle(IPC_CHANNELS.getSettings, () => loadSettings());

  ipcMain.handle(IPC_CHANNELS.updateSettings, async (_event, partial: Record<string, unknown>) => {
    const current = await loadSettings();
    const merged = parseSettings({ ...current, ...partial });
    await saveSettings(merged);
    return merged;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
