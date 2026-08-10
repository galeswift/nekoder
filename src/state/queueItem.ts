import type { MediaFile } from "../media/types";
import type { PresetId } from "../media/presets";
import type { SubtitleSelection } from "../media/ffmpegCommand";
import {
  selectAudioTrack,
  selectBurnSubtitleTracks,
  selectSubtitleTracksForCopy,
  type TrackSelectionPreferences,
} from "../media/trackSelection";
import type { PlexKind } from "../media/plexNaming";
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
  plexKind: PlexKind;
  plexFilenameOverride: string | undefined;
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
    subtitle: { mode: "burn", trackIndexes: [] },
    subtitleReason: undefined,
    outputPath: undefined,
    progress: undefined,
    plexKind: "episode",
    plexFilenameOverride: undefined,
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
 * the UI: first video track, an audio track, and a subtitle mode of "burn"
 * covering every burnable track in the preferred language (falling back to
 * "copy" if none are burnable, or "none" if there are no subtitle tracks).
 */
export function deriveTrackSelection(
  media: MediaFile,
  preferences: TrackSelectionPreferences,
): DerivedTrackSelection {
  const audio = selectAudioTrack(media.audioTracks, preferences.audioLanguage);
  const burnGroup = selectBurnSubtitleTracks(media.subtitleTracks, preferences.subtitleLanguage);

  const base = {
    videoTrackIndex: media.videoTracks[0]?.index,
    audioTrackIndex: audio.track?.index,
    audioReason: audio.reason,
  };

  if (burnGroup.tracks.length > 0) {
    return {
      ...base,
      subtitleReason: burnGroup.reason,
      subtitle: { mode: "burn", trackIndexes: burnGroup.tracks.map((t) => t.index) },
    };
  }

  const copyGroup = selectSubtitleTracksForCopy(media.subtitleTracks, preferences.subtitleLanguage);
  return {
    ...base,
    subtitleReason: copyGroup.reason,
    subtitle:
      copyGroup.tracks.length > 0
        ? { mode: "copy", trackIndexes: copyGroup.tracks.map((t) => t.index) }
        : { mode: "none", trackIndexes: [] },
  };
}
