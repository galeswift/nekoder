import { describe, expect, it } from "vitest";
import { buildFfmpegArgs, isBurnableSubtitleCodec, type EncodeRequest } from "./ffmpegCommand";
import { PRESETS } from "./presets";

function baseRequest(overrides: Partial<EncodeRequest> = {}): EncodeRequest {
  return {
    inputPath: "C:/rips/Cowboy Bebop/Episode 01.mkv",
    outputPath: "C:/out/Cowboy Bebop/Episode 01.mkv",
    preset: PRESETS["plex-h264"],
    videoTrackIndex: 0,
    audioTrackIndex: 1,
    subtitle: { mode: "copy", trackIndexes: [2] },
    subtitleTracks: [{ index: 2, codec: "subrip" }],
    ...overrides,
  };
}

describe("buildFfmpegArgs", () => {
  it("builds an H.264 encode with mapped audio and subtitle streams", () => {
    const args = buildFfmpegArgs(baseRequest());

    expect(args).toEqual([
      "-hide_banner",
      "-n",
      "-i",
      "C:/rips/Cowboy Bebop/Episode 01.mkv",
      "-map",
      "0:0",
      "-map",
      "0:1",
      "-map",
      "0:2",
      "-c:v",
      "libx264",
      "-crf",
      "20",
      "-preset",
      "medium",
      "-c:a",
      "aac",
      "-b:a",
      "256k",
      "-c:s",
      "copy",
      "-disposition:a:0",
      "default",
      "-disposition:s:0",
      "default",
      "C:/out/Cowboy Bebop/Episode 01.mkv",
    ]);
  });

  it("builds an HEVC encode", () => {
    const args = buildFfmpegArgs(baseRequest({ preset: PRESETS["plex-hevc"] }));
    expect(args).toContain("libx265");
    expect(args).toContain("22");
  });

  it("builds a remux with all streams copied", () => {
    const args = buildFfmpegArgs(baseRequest({ preset: PRESETS.remux }));

    expect(args).toEqual([
      "-hide_banner",
      "-n",
      "-i",
      "C:/rips/Cowboy Bebop/Episode 01.mkv",
      "-map",
      "0:0",
      "-map",
      "0:1",
      "-map",
      "0:2",
      "-c:v",
      "copy",
      "-c:a",
      "copy",
      "-c:s",
      "copy",
      "-disposition:a:0",
      "default",
      "-disposition:s:0",
      "default",
      "C:/out/Cowboy Bebop/Episode 01.mkv",
    ]);
  });

  it("omits subtitle mapping and codec args when subtitle mode is none", () => {
    const args = buildFfmpegArgs(baseRequest({ subtitle: { mode: "none", trackIndexes: [] } }));

    expect(args).not.toContain("-c:s");
    expect(args.filter((a) => a === "0:2")).toHaveLength(0);
  });

  it("maps multiple subtitle tracks when requested", () => {
    const args = baseRequest({ subtitle: { mode: "copy", trackIndexes: [2, 3] } });
    const result = buildFfmpegArgs(args);

    const mapIndexes = result.reduce<string[]>((acc, value, i) => {
      if (result[i - 1] === "-map") acc.push(value);
      return acc;
    }, []);
    expect(mapIndexes).toEqual(["0:0", "0:1", "0:2", "0:3"]);
  });

  it("omits audio args when no audio track is selected", () => {
    const args = buildFfmpegArgs(baseRequest({ audioTrackIndex: undefined }));
    expect(args).not.toContain("-c:a");
    expect(args).not.toContain("-disposition:a:0");
  });

  it("builds a burn-in subtitle filter when an encoding preset is used", () => {
    const args = buildFfmpegArgs(
      baseRequest({ subtitle: { mode: "burn", trackIndexes: [2] } }),
    );

    const vfIndex = args.indexOf("-vf");
    expect(vfIndex).toBeGreaterThan(-1);
    // Only subtitle stream in subtitleTracks, so its subtitle-relative ordinal is 0
    // even though its global ffprobe stream index (trackIndexes) is 2.
    expect(args[vfIndex + 1]).toContain("si=0");
    expect(args).not.toContain("-c:s");
  });

  it("chains multiple subtitles filters when burning in several tracks", () => {
    const args = buildFfmpegArgs(
      baseRequest({
        subtitle: { mode: "burn", trackIndexes: [2, 3] },
        subtitleTracks: [
          { index: 2, codec: "subrip" },
          { index: 3, codec: "ass" },
        ],
      }),
    );

    const vfIndex = args.indexOf("-vf");
    expect(args[vfIndex + 1]).toBe(
      `subtitles='C\\:/rips/Cowboy Bebop/Episode 01.mkv':si=0,subtitles='C\\:/rips/Cowboy Bebop/Episode 01.mkv':si=1`,
    );
  });

  it("uses the subtitle-relative ordinal (si), not the global ffprobe stream index", () => {
    // Layout: 0=video, 1=audio, 2=subtitle(eng), 3=subtitle(burn target, jpn).
    // The burn target is the 2nd subtitle stream, so si must be 1, not 3.
    const args = buildFfmpegArgs(
      baseRequest({
        subtitle: { mode: "burn", trackIndexes: [3] },
        subtitleTracks: [
          { index: 2, codec: "subrip" },
          { index: 3, codec: "ass" },
        ],
      }),
    );

    const vfIndex = args.indexOf("-vf");
    expect(args[vfIndex + 1]).toContain("si=1");
  });

  it("burns in a bitmap (PGS) subtitle track via overlay instead of the subtitles filter", () => {
    const args = buildFfmpegArgs(
      baseRequest({
        subtitle: { mode: "burn", trackIndexes: [2] },
        subtitleTracks: [{ index: 2, codec: "hdmv_pgs_subtitle" }],
      }),
    );

    expect(args).not.toContain("-vf");
    expect(args.slice(0, 4)).toEqual(["-hide_banner", "-n", "-i", baseRequest().inputPath]);
    const fcIndex = args.indexOf("-filter_complex");
    expect(fcIndex).toBeGreaterThan(-1);
    expect(args[fcIndex + 1]).toBe("[0:0][0:s:0]overlay[vout]");

    // Only the filtered stream should be mapped for video — mapping the raw
    // input track too would produce two video streams in the output.
    const mapIndexes = args.reduce<string[]>((acc, value, i) => {
      if (args[i - 1] === "-map") acc.push(value);
      return acc;
    }, []);
    expect(mapIndexes).toEqual(["[vout]", "0:1"]);

    // Caps the output at the real video/audio length rather than trusting
    // the (possibly bogus) duration the overlay filtergraph derives from a
    // bitmap subtitle's last cue.
    expect(args).toContain("-shortest");
  });

  it("does not force -shortest or -t for burn tracks that don't involve the overlay filter", () => {
    const args = buildFfmpegArgs(
      baseRequest({ subtitle: { mode: "burn", trackIndexes: [2] } }),
    );

    expect(args).not.toContain("-shortest");
    expect(args).not.toContain("-t");
  });

  it("bounds a bitmap burn with -t <probed duration> when duration is known", () => {
    const args = buildFfmpegArgs(
      baseRequest({
        subtitle: { mode: "burn", trackIndexes: [2] },
        subtitleTracks: [{ index: 2, codec: "hdmv_pgs_subtitle" }],
        durationSeconds: 1572.571,
      }),
    );

    const tIndex = args.indexOf("-t");
    expect(tIndex).toBeGreaterThan(-1);
    expect(args[tIndex + 1]).toBe("1572.571");
  });

  it("still bounds a bitmap burn with -t when no audio track is selected — -shortest alone is a no-op with only one mapped stream", () => {
    const args = buildFfmpegArgs(
      baseRequest({
        audioTrackIndex: undefined,
        subtitle: { mode: "burn", trackIndexes: [2] },
        subtitleTracks: [{ index: 2, codec: "hdmv_pgs_subtitle" }],
        durationSeconds: 1572.571,
      }),
    );

    const mapIndexes = args.reduce<string[]>((acc, value, i) => {
      if (args[i - 1] === "-map") acc.push(value);
      return acc;
    }, []);
    expect(mapIndexes).toEqual(["[vout]"]); // no audio stream mapped at all

    const tIndex = args.indexOf("-t");
    expect(tIndex).toBeGreaterThan(-1);
    expect(args[tIndex + 1]).toBe("1572.571");
  });

  it("omits -t when duration wasn't probed, relying on -shortest alone", () => {
    const args = buildFfmpegArgs(
      baseRequest({
        subtitle: { mode: "burn", trackIndexes: [2] },
        subtitleTracks: [{ index: 2, codec: "hdmv_pgs_subtitle" }],
        durationSeconds: undefined,
      }),
    );

    expect(args).not.toContain("-t");
    expect(args).toContain("-shortest");
  });

  it("never enables -fix_sub_duration — empirically breaks overlay subtitle compositing entirely", () => {
    const textBurnArgs = buildFfmpegArgs(
      baseRequest({ subtitle: { mode: "burn", trackIndexes: [2] } }),
    );
    const copyArgs = buildFfmpegArgs(
      baseRequest({
        subtitle: { mode: "copy", trackIndexes: [2] },
        subtitleTracks: [{ index: 2, codec: "hdmv_pgs_subtitle" }],
      }),
    );
    const bitmapBurnArgs = buildFfmpegArgs(
      baseRequest({
        subtitle: { mode: "burn", trackIndexes: [2] },
        subtitleTracks: [{ index: 2, codec: "hdmv_pgs_subtitle" }],
      }),
    );

    expect(textBurnArgs).not.toContain("-fix_sub_duration");
    expect(copyArgs).not.toContain("-fix_sub_duration");
    expect(bitmapBurnArgs).not.toContain("-fix_sub_duration");
  });

  it("mixes text and bitmap burn tracks in one filter_complex graph", () => {
    const args = buildFfmpegArgs(
      baseRequest({
        subtitle: { mode: "burn", trackIndexes: [2, 3] },
        subtitleTracks: [
          { index: 2, codec: "subrip" },
          { index: 3, codec: "hdmv_pgs_subtitle" },
        ],
      }),
    );

    const fcIndex = args.indexOf("-filter_complex");
    expect(args[fcIndex + 1]).toBe(
      `[0:0]subtitles='C\\:/rips/Cowboy Bebop/Episode 01.mkv':si=0[v0];[v0][0:s:1]overlay[vout]`,
    );
  });

  it("maps the selected video track into the filter graph, not a hardcoded track 0", () => {
    const args = buildFfmpegArgs(
      baseRequest({
        videoTrackIndex: 4,
        subtitle: { mode: "burn", trackIndexes: [2] },
        subtitleTracks: [{ index: 2, codec: "hdmv_pgs_subtitle" }],
      }),
    );

    const fcIndex = args.indexOf("-filter_complex");
    expect(args[fcIndex + 1]).toBe("[0:4][0:s:0]overlay[vout]");
  });

  it("rejects burning in an unsupported subtitle codec", () => {
    expect(() =>
      buildFfmpegArgs(
        baseRequest({
          subtitle: { mode: "burn", trackIndexes: [2] },
          subtitleTracks: [{ index: 2, codec: "dvb_teletext" }],
        }),
      ),
    ).toThrow(/unsupported subtitle codec/);
  });

  it("rejects burning in a track that isn't among the input's subtitle streams", () => {
    expect(() =>
      buildFfmpegArgs(
        baseRequest({
          subtitle: { mode: "burn", trackIndexes: [99] },
          subtitleTracks: [{ index: 2, codec: "subrip" }],
        }),
      ),
    ).toThrow(/not found/);
  });

  it("throws when burning subtitles with a remux (copy) preset", () => {
    expect(() =>
      buildFfmpegArgs(
        baseRequest({
          preset: PRESETS.remux,
          subtitle: { mode: "burn", trackIndexes: [2] },
        }),
      ),
    ).toThrow(/Cannot burn subtitles/);
  });

  it("never invokes a shell — arguments are a plain array, not a joined string", () => {
    const args = buildFfmpegArgs(baseRequest());
    expect(Array.isArray(args)).toBe(true);
    expect(args.every((a) => typeof a === "string")).toBe(true);
  });

  it("uses -n to avoid silently overwriting or hanging on prompts", () => {
    const args = buildFfmpegArgs(baseRequest());
    expect(args).toContain("-n");
  });
});

describe("isBurnableSubtitleCodec", () => {
  it("accepts text-based codecs", () => {
    expect(isBurnableSubtitleCodec("subrip")).toBe(true);
    expect(isBurnableSubtitleCodec("ass")).toBe(true);
    expect(isBurnableSubtitleCodec("ASS")).toBe(true);
  });

  it("accepts bitmap codecs", () => {
    expect(isBurnableSubtitleCodec("hdmv_pgs_subtitle")).toBe(true);
    expect(isBurnableSubtitleCodec("dvd_subtitle")).toBe(true);
    expect(isBurnableSubtitleCodec("dvb_subtitle")).toBe(true);
  });

  it("rejects unsupported codecs", () => {
    expect(isBurnableSubtitleCodec("dvb_teletext")).toBe(false);
  });
});
