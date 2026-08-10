import { describe, expect, it } from "vitest";
import { normalizeMediaFile, type RawFfprobeOutput } from "./ffprobe";
import japaneseAudioEnglishFullSubs from "./__fixtures__/japanese_audio_english_full_subs.json";
import missingLanguageMetadata from "./__fixtures__/missing_language_metadata.json";

describe("normalizeMediaFile", () => {
  it("splits streams into video/audio/subtitle tracks", () => {
    const media = normalizeMediaFile("C:/rips/ep01.mkv", japaneseAudioEnglishFullSubs as RawFfprobeOutput);

    expect(media.path).toBe("C:/rips/ep01.mkv");
    expect(media.durationSeconds).toBeCloseTo(1425.958, 3);
    expect(media.videoTracks).toHaveLength(1);
    expect(media.audioTracks).toHaveLength(1);
    expect(media.subtitleTracks).toHaveLength(2);
  });

  it("normalizes language and disposition fields", () => {
    const media = normalizeMediaFile("ep01.mkv", japaneseAudioEnglishFullSubs as RawFfprobeOutput);
    const audio = media.audioTracks[0]!;

    expect(audio.language).toBe("jpn");
    expect(audio.disposition.default).toBe(true);
    expect(audio.disposition.forced).toBe(false);
  });

  it("handles missing language/title metadata without throwing", () => {
    const media = normalizeMediaFile("ep01.mkv", missingLanguageMetadata as RawFfprobeOutput);

    expect(media.audioTracks[0]!.language).toBeUndefined();
    expect(media.audioTracks[0]!.title).toBeUndefined();
    expect(media.subtitleTracks[0]!.language).toBeUndefined();
  });

  it("handles a completely empty ffprobe payload", () => {
    const media = normalizeMediaFile("empty.mkv", {} as RawFfprobeOutput);

    expect(media.durationSeconds).toBeUndefined();
    expect(media.videoTracks).toEqual([]);
    expect(media.audioTracks).toEqual([]);
    expect(media.subtitleTracks).toEqual([]);
  });

  it("treats 'und' language tags as missing", () => {
    const media = normalizeMediaFile(
      "ep01.mkv",
      {
        format: { duration: "100" },
        streams: [
          {
            index: 0,
            codec_type: "audio",
            codec_name: "aac",
            tags: { language: "und" },
            disposition: { default: 0, forced: 0 },
          },
        ],
      } as RawFfprobeOutput,
    );

    expect(media.audioTracks[0]!.language).toBeUndefined();
  });
});
