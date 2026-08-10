import type { MediaFile } from "../media/types";
import type { PresetId } from "../media/presets";
import type { SubtitleSelection } from "../media/ffmpegCommand";
import { selectTracks, type TrackSelectionPreferences } from "../media/trackSelection";
import type { DiscoveredFile } from "../ipc/api";

export type QueueItemStatus =
  | "pending"
  | "probing"
  | "ready"
  | "encoding"
  | "complete"
  | "error"
  | "conflict"
  | "cancelled";

export interface QueueItemProgress {
  percent: number | undefined;
  elapsedSeconds: number;
  speed: number | undefined;
  etaSeconds: number | undefined;
}

export interface QueueItem {
  id: string;
  inputPath: string;
  sourceRoot: string;
  filename: string;
  status: QueueItemStatus;
  errorMessage: string | undefined;
  media: MediaFile | undefined;
  presetId: PresetId;
  videoTrackIndex: number | undefined;
  audioTrackIndex: number | undefined;
  audioReason: string | undefined;
  subtitle: SubtitleSelection;
  subtitleReason: string | undefined;
  outputPath: string | undefined;
  progress: QueueItemProgress | undefined;
}

function filenameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

export function createQueueItem(file: DiscoveredFile, defaultPresetId: PresetId): QueueItem {
  return {
    id: crypto.randomUUID(),
    inputPath: file.path,
    sourceRoot: file.sourceRoot,
    filename: filenameFromPath(file.path),
    status: "pending",
    errorMessage: undefined,
    media: undefined,
    presetId: defaultPresetId,
    videoTrackIndex: undefined,
    audioTrackIndex: undefined,
    audioReason: undefined,
    subtitle: { mode: "copy", trackIndexes: [] },
    subtitleReason: undefined,
    outputPath: undefined,
    progress: undefined,
  };
}

export interface DerivedTrackSelection {
  videoTrackIndex: number | undefined;
  audioTrackIndex: number | undefined;
  audioReason: string | undefined;
  subtitle: SubtitleSelection;
  subtitleReason: string | undefined;
}

/**
 * Turns a normalized MediaFile into the automatic track selections shown in
 * the UI: first video track, best-scoring audio/subtitle tracks per the
 * anime heuristics, and a subtitle mode of "copy" if a subtitle track was
 * selected or "none" if there wasn't one worth using.
 */
export function deriveTrackSelection(
  media: MediaFile,
  preferences: TrackSelectionPreferences,
): DerivedTrackSelection {
  const selection = selectTracks(media, preferences);
  const subtitleTrack = selection.subtitle.track;

  return {
    videoTrackIndex: media.videoTracks[0]?.index,
    audioTrackIndex: selection.audio.track?.index,
    audioReason: selection.audio.reason,
    subtitleReason: selection.subtitle.reason,
    subtitle: subtitleTrack
      ? { mode: "copy", trackIndexes: [subtitleTrack.index] }
      : { mode: "none", trackIndexes: [] },
  };
}
