import type { EncodingPreset } from "./presets";

export type SubtitleMode = "copy" | "burn" | "none";

export interface SubtitleSelection {
  mode: SubtitleMode;
  /** Stream indexes (as reported by ffprobe) to copy. Ignored for "burn" and "none". */
  trackIndexes: number[];
  /** Stream index to burn in. Required and used only when mode is "burn". */
  burnTrackIndex?: number;
}

/** Subtitle codecs the ffmpeg `subtitles` filter can render (text-based, via libass). */
const BURNABLE_SUBTITLE_CODECS = new Set(["subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "text", "subviewer"]);

/**
 * Whether a subtitle track's codec can be burned in via the ffmpeg `subtitles`
 * filter. Bitmap codecs (PGS, VOBSUB/DVD, DVB) are rasterized images, not
 * text, and that filter cannot render them.
 */
export function isBurnableSubtitleCodec(codec: string): boolean {
  return BURNABLE_SUBTITLE_CODECS.has(codec.toLowerCase());
}

export interface SubtitleTrackInfo {
  index: number;
  codec: string;
}

export interface EncodeRequest {
  inputPath: string;
  outputPath: string;
  preset: EncodingPreset;
  videoTrackIndex: number;
  audioTrackIndex: number | undefined;
  subtitle: SubtitleSelection;
  /** All subtitle streams present in the input, in ffprobe stream order. Required for "burn" mode. */
  subtitleTracks?: SubtitleTrackInfo[];
}

/**
 * Builds the ffmpeg argument list for an encode request. Returns a plain
 * string array (never a shell string) so it can be passed directly to
 * `spawn(ffmpegPath, args)` without shell interpretation.
 */
export function buildFfmpegArgs(request: EncodeRequest): string[] {
  const { preset } = request;

  if (request.subtitle.mode === "burn" && preset.video.mode === "copy") {
    throw new Error(
      "Cannot burn subtitles while copying video (remux preset). Choose an encoding preset instead.",
    );
  }
  if (request.subtitle.mode === "burn" && request.subtitle.burnTrackIndex === undefined) {
    throw new Error("Burn-in subtitle mode requires a burnTrackIndex.");
  }
  if (request.subtitle.mode === "burn") {
    const burnTrack = request.subtitleTracks?.find((t) => t.index === request.subtitle.burnTrackIndex);
    if (!burnTrack) {
      throw new Error("Burn-in subtitle track was not found among the input's subtitle streams.");
    }
    if (!isBurnableSubtitleCodec(burnTrack.codec)) {
      throw new Error(
        `Cannot burn in "${burnTrack.codec}" subtitles: this is an image-based format that ffmpeg's text renderer can't draw. Copy this track into the output instead, or choose a text-based subtitle track to burn in.`,
      );
    }
  }

  const args: string[] = ["-hide_banner", "-n", "-i", request.inputPath];

  args.push("-map", `0:${request.videoTrackIndex}`);
  if (request.audioTrackIndex !== undefined) {
    args.push("-map", `0:${request.audioTrackIndex}`);
  }
  if (request.subtitle.mode === "copy") {
    for (const index of request.subtitle.trackIndexes) {
      args.push("-map", `0:${index}`);
    }
  }

  args.push(...videoArgs(request));
  args.push(...audioArgs(request));
  args.push(...subtitleArgs(request));
  args.push(...dispositionArgs(request));

  args.push(request.outputPath);

  return args;
}

function videoArgs(request: EncodeRequest): string[] {
  const { video } = request.preset;

  if (video.mode === "copy") {
    return ["-c:v", "copy"];
  }

  const encoder = video.codec === "h264" ? "libx264" : "libx265";
  const args = ["-c:v", encoder, "-crf", String(video.crf), "-preset", video.preset];

  if (request.subtitle.mode === "burn") {
    const ordinal = request.subtitleTracks!.findIndex((t) => t.index === request.subtitle.burnTrackIndex);
    args.push("-vf", `subtitles='${escapeForSubtitlesFilter(request.inputPath)}':si=${ordinal}`);
  }

  return args;
}

function audioArgs(request: EncodeRequest): string[] {
  if (request.audioTrackIndex === undefined) return [];

  const { audio } = request.preset;
  if (audio.mode === "copy") {
    return ["-c:a", "copy"];
  }
  return ["-c:a", audio.codec, "-b:a", `${audio.bitrateKbps}k`];
}

function subtitleArgs(request: EncodeRequest): string[] {
  if (request.subtitle.mode === "copy" && request.subtitle.trackIndexes.length > 0) {
    return ["-c:s", "copy"];
  }
  return [];
}

function dispositionArgs(request: EncodeRequest): string[] {
  const args: string[] = [];

  if (request.audioTrackIndex !== undefined) {
    args.push("-disposition:a:0", "default");
  }
  if (request.subtitle.mode === "copy" && request.subtitle.trackIndexes.length > 0) {
    args.push("-disposition:s:0", "default");
  }

  return args;
}

function escapeForSubtitlesFilter(path: string): string {
  return path.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}
