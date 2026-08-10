import type { PresetId } from "../media/presets";
import { DEFAULT_PRESET_ID } from "../media/presets";

export interface AppSettings {
  lastOutputDirectory: string | undefined;
  preferredAudioLanguage: string;
  preferredSubtitleLanguage: string;
  lastPresetId: PresetId;
  preserveDirectoryStructure: boolean;
  ffmpegPath: string | undefined;
  ffprobePath: string | undefined;
}

export const DEFAULT_SETTINGS: AppSettings = {
  lastOutputDirectory: undefined,
  preferredAudioLanguage: "jpn",
  preferredSubtitleLanguage: "eng",
  lastPresetId: DEFAULT_PRESET_ID,
  preserveDirectoryStructure: true,
  ffmpegPath: undefined,
  ffprobePath: undefined,
};

const VALID_PRESET_IDS: PresetId[] = ["plex-h264", "plex-hevc", "remux"];

function isPresetId(value: unknown): value is PresetId {
  return typeof value === "string" && (VALID_PRESET_IDS as string[]).includes(value);
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Merges parsed settings JSON with defaults, tolerating a missing file,
 * missing fields, or fields of the wrong type. Never throws — an
 * unreadable settings file should fall back to defaults, not crash startup.
 */
export function parseSettings(raw: unknown): AppSettings {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

  return {
    lastOutputDirectory: stringOrUndefined(source.lastOutputDirectory),
    preferredAudioLanguage: stringOrDefault(
      source.preferredAudioLanguage,
      DEFAULT_SETTINGS.preferredAudioLanguage,
    ),
    preferredSubtitleLanguage: stringOrDefault(
      source.preferredSubtitleLanguage,
      DEFAULT_SETTINGS.preferredSubtitleLanguage,
    ),
    lastPresetId: isPresetId(source.lastPresetId) ? source.lastPresetId : DEFAULT_SETTINGS.lastPresetId,
    preserveDirectoryStructure:
      typeof source.preserveDirectoryStructure === "boolean"
        ? source.preserveDirectoryStructure
        : DEFAULT_SETTINGS.preserveDirectoryStructure,
    ffmpegPath: stringOrUndefined(source.ffmpegPath),
    ffprobePath: stringOrUndefined(source.ffprobePath),
  };
}

export function serializeSettings(settings: AppSettings): string {
  return JSON.stringify(settings, null, 2);
}
