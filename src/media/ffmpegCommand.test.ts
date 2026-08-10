import { describe, expect, it } from "vitest";
import { buildFfmpegArgs, type EncodeRequest } from "./ffmpegCommand";
import { PRESETS } from "./presets";

function baseRequest(overrides: Partial<EncodeRequest> = {}): EncodeRequest {
  return {
    inputPath: "C:/rips/Cowboy Bebop/Episode 01.mkv",
    outputPath: "C:/out/Cowboy Bebop/Episode 01.mkv",
    preset: PRESETS["plex-h264"],
    videoTrackIndex: 0,
    audioTrackIndex: 1,
    subtitle: { mode: "copy", trackIndexes: [2] },
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
      baseRequest({ subtitle: { mode: "burn", trackIndexes: [], burnTrackIndex: 2 } }),
    );

    const vfIndex = args.indexOf("-vf");
    expect(vfIndex).toBeGreaterThan(-1);
    expect(args[vfIndex + 1]).toContain("si=2");
    expect(args).not.toContain("-c:s");
  });

  it("throws when burning subtitles with a remux (copy) preset", () => {
    expect(() =>
      buildFfmpegArgs(
        baseRequest({
          preset: PRESETS.remux,
          subtitle: { mode: "burn", trackIndexes: [], burnTrackIndex: 2 },
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
