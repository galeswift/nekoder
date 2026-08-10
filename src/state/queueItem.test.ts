import { describe, expect, it } from "vitest";
import { createQueueItem, deriveTrackSelection } from "./queueItem";
import { normalizeMediaFile, type RawFfprobeOutput } from "../media/ffprobe";
import japaneseAudioEnglishFullSubs from "../media/__fixtures__/japanese_audio_english_full_subs.json";
import missingLanguageMetadata from "../media/__fixtures__/missing_language_metadata.json";
import signsAndSongsPlusDialogue from "../media/__fixtures__/signs_and_songs_plus_dialogue.json";

describe("createQueueItem", () => {
  it("derives a filename from a Windows-style path", () => {
    const item = createQueueItem({ path: "D:\\rips\\Show\\Episode 01.mkv", sourceRoot: "D:\\rips\\Show" }, "plex-h264");
    expect(item.filename).toBe("Episode 01.mkv");
    expect(item.status).toBe("pending");
    expect(item.presetId).toBe("plex-h264");
  });

  it("assigns a unique id to each item", () => {
    const a = createQueueItem({ path: "a.mkv", sourceRoot: "." }, "remux");
    const b = createQueueItem({ path: "b.mkv", sourceRoot: "." }, "remux");
    expect(a.id).not.toBe(b.id);
  });
});

describe("deriveTrackSelection", () => {
  it("selects Japanese audio and full English subtitles with reasons", () => {
    const media = normalizeMediaFile("ep01.mkv", japaneseAudioEnglishFullSubs as RawFfprobeOutput);
    const result = deriveTrackSelection(media, { audioLanguage: "jpn", subtitleLanguage: "eng" });

    expect(result.videoTrackIndex).toBe(0);
    expect(result.audioTrackIndex).toBe(1);
    expect(result.subtitle).toEqual({ mode: "copy", trackIndexes: [2, 3] });
    expect(result.audioReason).toContain("jpn");
    expect(result.subtitleReason).toContain("Selected stream 2");
  });

  it("copies both the dialogue track and a separate signs/songs track", () => {
    const media = normalizeMediaFile("ep01.mkv", signsAndSongsPlusDialogue as RawFfprobeOutput);
    const result = deriveTrackSelection(media, { audioLanguage: "jpn", subtitleLanguage: "eng" });

    expect(result.subtitle).toEqual({ mode: "copy", trackIndexes: [3, 2] });
  });

  it("falls back to subtitle mode 'none' when there are no subtitle tracks", () => {
    const media = normalizeMediaFile("ep01.mkv", missingLanguageMetadata as RawFfprobeOutput);
    const withoutSubs = { ...media, subtitleTracks: [] };
    const result = deriveTrackSelection(withoutSubs, { audioLanguage: "jpn", subtitleLanguage: "eng" });

    expect(result.subtitle).toEqual({ mode: "none", trackIndexes: [] });
  });
});
