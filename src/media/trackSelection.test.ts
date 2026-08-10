import { describe, expect, it } from "vitest";
import { normalizeMediaFile, type RawFfprobeOutput } from "./ffprobe";
import { selectAudioTrack, selectBurnSubtitleTracks, selectSubtitleTracksForCopy, selectTracks } from "./trackSelection";

import japaneseAudioEnglishFullSubs from "./__fixtures__/japanese_audio_english_full_subs.json";
import japaneseAndEnglishDub from "./__fixtures__/japanese_and_english_dub.json";
import signsAndSongsPlusDialogue from "./__fixtures__/signs_and_songs_plus_dialogue.json";
import commentaryAudio from "./__fixtures__/commentary_audio.json";
import missingLanguageMetadata from "./__fixtures__/missing_language_metadata.json";
import multipleJapaneseTracks from "./__fixtures__/multiple_japanese_tracks.json";
import surroundAndStereoTracks from "./__fixtures__/surround_and_stereo_tracks.json";

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
  });

  it("returns undefined when there are no audio tracks", () => {
    const result = selectAudioTrack([], "jpn");
    expect(result.track).toBeUndefined();
    expect(result.reason).toContain("No audio tracks");
  });
});

describe("selectBurnSubtitleTracks", () => {
  it("selects every English subtitle track, not just one", () => {
    const media = load(signsAndSongsPlusDialogue);
    const result = selectBurnSubtitleTracks(media.subtitleTracks, "eng");
    expect(result.tracks.map((t) => t.title)).toEqual(["Signs & Songs", "Dialogue"]);
  });

  it("includes the full-dialogue track when there's only one", () => {
    const media = load(commentaryAudio);
    const result = selectBurnSubtitleTracks(media.subtitleTracks, "eng");
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]?.title).toBe("Full Subtitles");
  });

  it("avoids commentary subtitles", () => {
    const media = load(commentaryAudio);
    const result = selectBurnSubtitleTracks(media.subtitleTracks, "eng");
    expect(result.tracks.some((t) => t.title === "Commentary Subtitles")).toBe(false);
  });

  it("falls back gracefully when language metadata is missing", () => {
    const media = load(missingLanguageMetadata);
    const result = selectBurnSubtitleTracks(media.subtitleTracks, "eng");
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]?.index).toBe(2);
  });

  it("returns an empty list when there are no subtitle tracks", () => {
    const result = selectBurnSubtitleTracks([], "eng");
    expect(result.tracks).toEqual([]);
  });
});

describe("selectSubtitleTracksForCopy", () => {
  it("includes both the dialogue track and the separate signs/songs track", () => {
    const media = load(signsAndSongsPlusDialogue);
    const result = selectSubtitleTracksForCopy(media.subtitleTracks, "eng");
    expect(result.tracks.map((t) => t.title)).toEqual(["Signs & Songs", "Dialogue"]);
  });

  it("returns just the single track when there is no separate signs/songs track", () => {
    const media = load(commentaryAudio);
    const result = selectSubtitleTracksForCopy(media.subtitleTracks, "eng");
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]?.title).toBe("Full Subtitles");
  });

  it("returns an empty list when there are no subtitle tracks", () => {
    const result = selectSubtitleTracksForCopy([], "eng");
    expect(result.tracks).toEqual([]);
  });
});

describe("selectTracks", () => {
  it("selects both audio and subtitle tracks together", () => {
    const media = load(japaneseAudioEnglishFullSubs);
    const selection = selectTracks(media, { audioLanguage: "jpn", subtitleLanguage: "eng" });

    expect(selection.audio.track?.language).toBe("jpn");
    expect(selection.subtitle.tracks.map((t) => t.title)).toEqual(["Full Subtitles", "Signs & Songs"]);
  });
});
