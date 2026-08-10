import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../src/ipc/api";
import type {
  DesktopApi,
  DiscoveredFile,
  EncodeProgressEvent,
  EncodeStatusEvent,
  FfmpegToolsStatus,
  LogEvent,
  ProbeMediaResponse,
  QueueEncodeItem,
} from "../src/ipc/api";
import type { AppSettings } from "../src/settings/types";

function subscribe<T>(channel: string, callback: (event: T) => void): () => void {
  const listener = (_event: unknown, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: DesktopApi = {
  openFiles: (): Promise<DiscoveredFile[]> => ipcRenderer.invoke(IPC_CHANNELS.openFiles),
  openFolder: (): Promise<DiscoveredFile[]> => ipcRenderer.invoke(IPC_CHANNELS.openFolder),
  chooseOutputFolder: (): Promise<string | undefined> => ipcRenderer.invoke(IPC_CHANNELS.chooseOutputFolder),
  probeMedia: (path: string): Promise<ProbeMediaResponse> => ipcRenderer.invoke(IPC_CHANNELS.probeMedia, path),
  checkFfmpegTools: (): Promise<FfmpegToolsStatus> => ipcRenderer.invoke(IPC_CHANNELS.checkFfmpegTools),
  browseForExecutable: (kind: "ffmpeg" | "ffprobe"): Promise<string | undefined> =>
    ipcRenderer.invoke(IPC_CHANNELS.browseForExecutable, kind),
  startEncode: (items: QueueEncodeItem[]): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.startEncode, items),
  cancelEncode: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.cancelEncode, id),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  updateSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.updateSettings, partial),
  onEncodeProgress: (callback: (event: EncodeProgressEvent) => void) =>
    subscribe(IPC_CHANNELS.encodeProgress, callback),
  onEncodeStatus: (callback: (event: EncodeStatusEvent) => void) =>
    subscribe(IPC_CHANNELS.encodeStatus, callback),
  onLog: (callback: (event: LogEvent) => void) => subscribe(IPC_CHANNELS.log, callback),
};

contextBridge.exposeInMainWorld("desktop", api);
