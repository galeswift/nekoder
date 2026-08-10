import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings, serializeSettings } from "./types";

describe("parseSettings", () => {
  it("returns defaults when given undefined", () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults when given null or a non-object", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("garbage")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it("preserves valid fields from a full settings object", () => {
    const input = {
      lastOutputDirectory: "D:/out",
      preferredAudioLanguage: "jpn",
      preferredSubtitleLanguage: "eng",
      lastPresetId: "plex-hevc",
      preserveDirectoryStructure: false,
      ffmpegPath: "C:/ffmpeg/ffmpeg.exe",
      ffprobePath: "C:/ffmpeg/ffprobe.exe",
    };
    expect(parseSettings(input)).toEqual(input);
  });

  it("falls back to defaults for an invalid presetId", () => {
    const result = parseSettings({ lastPresetId: "not-a-real-preset" });
    expect(result.lastPresetId).toBe(DEFAULT_SETTINGS.lastPresetId);
  });

  it("falls back to defaults for wrongly typed fields", () => {
    const result = parseSettings({
      preferredAudioLanguage: 5,
      preserveDirectoryStructure: "yes",
    });
    expect(result.preferredAudioLanguage).toBe(DEFAULT_SETTINGS.preferredAudioLanguage);
    expect(result.preserveDirectoryStructure).toBe(DEFAULT_SETTINGS.preserveDirectoryStructure);
  });

  it("treats empty strings as unset for optional path fields", () => {
    const result = parseSettings({ ffmpegPath: "", lastOutputDirectory: "" });
    expect(result.ffmpegPath).toBeUndefined();
    expect(result.lastOutputDirectory).toBeUndefined();
  });

  it("fills in missing fields from a partial object", () => {
    const result = parseSettings({ preferredAudioLanguage: "jpn" });
    expect(result.preferredSubtitleLanguage).toBe(DEFAULT_SETTINGS.preferredSubtitleLanguage);
    expect(result.lastPresetId).toBe(DEFAULT_SETTINGS.lastPresetId);
  });
});

describe("serializeSettings", () => {
  it("produces round-trippable JSON", () => {
    const json = serializeSettings(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.parse(json))).toEqual(DEFAULT_SETTINGS);
  });
});
