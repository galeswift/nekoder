import type { MediaFile } from "../media/types";
import type { PresetId } from "../media/presets";
import type { SubtitleSelection, SubtitleTrackInfo } from "../media/ffmpegCommand";
import type { AppSettings } from "../settings/types";
import type { ToolLocation } from "../media/toolLocator";

/** A file discovered via a file/folder picker, before probing. */
export interface DiscoveredFile {
  path: string;
  /** Root directory used to compute the preserved relative output path. */
  sourceRoot: string;
}

export type ProbeMediaResponse = { ok: true; media: MediaFile } | { ok: false; error: string };

export interface ResolveOutputPathRequest {
  sourceRoot: string;
  filePath: string;
  outputRoot: string;
  preserveStructure: boolean;
  /** When set, overrides preserveStructure with a Plex-shaped destination. */
  plexPath?: { dirSegments: string[]; filename: string };
}

export interface ResolveOutputPathResponse {
  outputPath: string;
  exists: boolean;
}

export interface QueueEncodeItem {
  id: string;
  inputPath: string;
  outputPath: string;
  presetId: PresetId;
  videoTrackIndex: number;
  audioTrackIndex: number | undefined;
  subtitle: SubtitleSelection;
  /** All subtitle streams present in the input, in ffprobe stream order. */
  subtitleTracks: SubtitleTrackInfo[];
  durationSeconds: number | undefined;
}

export interface EncodeProgressEvent {
  id: string;
  percent: number | undefined;
  elapsedSeconds: number;
  speed: number | undefined;
  etaSeconds: number | undefined;
}

export type EncodeItemStatus = "encoding" | "complete" | "error" | "cancelled";

export interface EncodeStatusEvent {
  id: string;
  status: EncodeItemStatus;
  error?: string;
}

export interface LogEvent {
  timestamp: number;
  level: "info" | "error";
  message: string;
}

export interface FfmpegToolsStatus {
  ffmpeg: ToolLocation | undefined;
  ffprobe: ToolLocation | undefined;
}

export interface DesktopApi {
  openFiles(): Promise<DiscoveredFile[]>;
  openFolder(): Promise<DiscoveredFile[]>;
  chooseOutputFolder(): Promise<string | undefined>;
  resolveOutputPath(request: ResolveOutputPathRequest): Promise<ResolveOutputPathResponse>;
  isCaseSensitiveDirectory(directory: string): Promise<boolean>;
  probeMedia(path: string): Promise<ProbeMediaResponse>;
  checkFfmpegTools(): Promise<FfmpegToolsStatus>;
  browseForExecutable(kind: "ffmpeg" | "ffprobe"): Promise<string | undefined>;
  startEncode(items: QueueEncodeItem[]): Promise<void>;
  cancelEncode(id: string): Promise<void>;
  getSettings(): Promise<AppSettings>;
  updateSettings(partial: Partial<AppSettings>): Promise<AppSettings>;
  onEncodeProgress(callback: (event: EncodeProgressEvent) => void): () => void;
  onEncodeStatus(callback: (event: EncodeStatusEvent) => void): () => void;
  onLog(callback: (event: LogEvent) => void): () => void;
}

export const IPC_CHANNELS = {
  openFiles: "files:open",
  openFolder: "files:openFolder",
  chooseOutputFolder: "files:chooseOutputFolder",
  resolveOutputPath: "files:resolveOutputPath",
  checkCaseSensitivity: "files:checkCaseSensitivity",
  probeMedia: "media:probe",
  checkFfmpegTools: "media:checkTools",
  browseForExecutable: "media:browseForExecutable",
  startEncode: "encoding:start",
  cancelEncode: "encoding:cancel",
  getSettings: "settings:get",
  updateSettings: "settings:update",
  encodeProgress: "encoding:progress",
  encodeStatus: "encoding:status",
  log: "log:event",
} as const;
