import { describe, expect, it } from "vitest";
import { normalizeMediaFile, type RawFfprobeOutput } from "./ffprobe";
import { selectAudioTrack, selectSubtitleTrack, selectTracks } from "./trackSelection";

import japaneseAudioEnglishFullSubs from "./__fixtures__/japanese_audio_english_full_subs.json";
import japaneseAndEnglishDub from "./__fixtures__/japanese_and_english_dub.json";
import fullAndForcedEnglishSubs from "./__fixtures__/full_and_forced_english_subs.json";
import signsAndSongsPlusDialogue from "./__fixtures__/signs_and_songs_plus_dialogue.json";
import commentaryAudio from "./__fixtures__/commentary_audio.json";
import missingLanguageMetadata from "./__fixtures__/missing_language_metadata.json";
import multipleJapaneseTracks from "./__fixtures__/multiple_japanese_tracks.json";
import surroundAndStereoTracks from "./__fixtures__/surround_and_stereo_tracks.json";
import weirdTitles from "./__fixtures__/weird_titles.json";

function load(fixture: unknown) {
  return normalizeMediaFile("test.mkv", fixture as RawFfprobeOutput);
}

describe("selectAudioTrack", () => {
  it("prefers Japanese audio when a single Japanese track exists", () => {
    const media = load(japaneseAudioEnglishFullSubs);
    const result = selectAudioTrack(media.audioTracks, "jpn");
    expect(result.track?.language).toBe("jpn");
  });

  it("prefers Japanese over an English dub track", () => {
    const media = load(japaneseAndEnglishDub);
    const result = selectAudioTrack(media.audioTracks, "jpn");
    expect(result.track?.title).toBe("Japanese");
  });

  it("avoids commentary tracks even when they are Japanese", () => {
    const media = load(commentaryAudio);
    const result = selectAudioTrack(media.audioTracks, "jpn");
    expect(result.track?.title).toBe("Japanese");
    expect(result.track?.index).toBe(1);
  });

  it("prefers the default Japanese track among multiple Japanese tracks", () => {
    const media = load(multipleJapaneseTracks);
    const result = selectAudioTrack(media.audioTracks, "jpn");
    expect(result.track?.title).toBe("Surround Mix");
  });

  it("falls back gracefully when language metadata is missing", () => {
    const media = load(missingLanguageMetadata);
    const result = selectAudioTrack(media.audioTracks, "jpn");
    expect(result.track).toBeDefined();
    expect(result.track?.index).toBe(1);
  });

  it("handles surround vs stereo tracks by preferring the default", () => {
    const media = load(surroundAndStereoTracks);
    const result = selectAudioTrack(media.audioTracks, "jpn");
    expect(result.track?.title).toBe("5.1");
  });

  it("produces a human-readable reason", () => {
    const media = load(japaneseAudioEnglishFullSubs);
    const result = selectAudioTrack(media.audioTracks, "jpn");
    expect(result.reason).toContain("Selected stream");
    expect(result.reason).toContain("jpn");
  });

  it("returns undefined when there are no audio tracks", () => {
    const result = selectAudioTrack([], "jpn");
    expect(result.track).toBeUndefined();
    expect(result.reason).toContain("No audio tracks");
  });
});

describe("selectSubtitleTrack", () => {
  it("prefers full dialogue subtitles over signs/songs", () => {
    const media = load(signsAndSongsPlusDialogue);
    const result = selectSubtitleTrack(media.subtitleTracks, "eng");
    expect(result.track?.title).toBe("Dialogue");
  });

  it("prefers non-forced subtitles over forced-only", () => {
    const media = load(fullAndForcedEnglishSubs);
    const result = selectSubtitleTrack(media.subtitleTracks, "eng");
    expect(result.track?.title).toBe("Full");
  });

  it("avoids commentary subtitles", () => {
    const media = load(commentaryAudio);
    const result = selectSubtitleTrack(media.subtitleTracks, "eng");
    expect(result.track?.title).toBe("Full Subtitles");
  });

  it("selects the best English track for poorly named/weird titles", () => {
    const media = load(weirdTitles);
    const result = selectSubtitleTrack(media.subtitleTracks, "eng");
    expect(result.track?.title).toBe("Full Dialogue - SDH");
  });

  it("falls back gracefully when language metadata is missing", () => {
    const media = load(missingLanguageMetadata);
    const result = selectSubtitleTrack(media.subtitleTracks, "eng");
    expect(result.track).toBeDefined();
    expect(result.track?.index).toBe(2);
  });

  it("returns undefined when there are no subtitle tracks", () => {
    const result = selectSubtitleTrack([], "eng");
    expect(result.track).toBeUndefined();
  });
});

describe("selectTracks", () => {
  it("selects both audio and subtitle tracks together", () => {
    const media = load(japaneseAudioEnglishFullSubs);
    const selection = selectTracks(media, { audioLanguage: "jpn", subtitleLanguage: "eng" });

    expect(selection.audio.track?.language).toBe("jpn");
    expect(selection.subtitle.track?.title).toBe("Full Subtitles");
  });
});
