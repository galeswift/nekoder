import type { EncodingPreset } from "./presets";

export type SubtitleMode = "copy" | "burn" | "none";

export interface SubtitleSelection {
  mode: SubtitleMode;
  /**
   * Stream indexes (as reported by ffprobe) to copy ("copy" mode) or burn
   * into the video, in order ("burn" mode). Ignored for "none".
   */
  trackIndexes: number[];
}

/** Subtitle codecs the ffmpeg `subtitles` filter can render (text-based, via libass). */
const TEXT_SUBTITLE_CODECS = new Set(["subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "text", "subviewer"]);

/** Bitmap subtitle codecs, burned in via `overlay` instead of the `subtitles` filter. */
const BITMAP_SUBTITLE_CODECS = new Set(["hdmv_pgs_subtitle", "pgssub", "dvd_subtitle", "dvdsub", "dvb_subtitle", "dvbsub"]);

function isTextSubtitleCodec(codec: string): boolean {
  return TEXT_SUBTITLE_CODECS.has(codec.toLowerCase());
}

function isBitmapSubtitleCodec(codec: string): boolean {
  return BITMAP_SUBTITLE_CODECS.has(codec.toLowerCase());
}

/** Whether a subtitle track's codec can be burned in, via either `subtitles` (text) or `overlay` (bitmap). */
export function isBurnableSubtitleCodec(codec: string): boolean {
  return isTextSubtitleCodec(codec) || isBitmapSubtitleCodec(codec);
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
  /**
   * The source's real duration as probed *before* encoding (e.g. ffprobe's
   * container-level duration). Used to bound bitmap subtitle burn-in — see
   * the `-t` usage below.
   */
  durationSeconds?: number;
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
  if (request.subtitle.mode === "burn" && request.subtitle.trackIndexes.length === 0) {
    throw new Error("Burn-in subtitle mode requires at least one track to burn in.");
  }
  if (request.subtitle.mode === "burn") {
    for (const index of request.subtitle.trackIndexes) {
      const burnTrack = request.subtitleTracks?.find((t) => t.index === index);
      if (!burnTrack) {
        throw new Error(`Burn-in subtitle track ${index} was not found among the input's subtitle streams.`);
      }
      if (!isBurnableSubtitleCodec(burnTrack.codec)) {
        throw new Error(
          `Cannot burn in "${burnTrack.codec}" subtitles: unsupported subtitle codec. Copy this track into the output instead.`,
        );
      }
    }
  }

  const args: string[] = ["-hide_banner", "-n", "-i", request.inputPath];

  if (hasBitmapBurnTrack(request)) {
    args.push("-map", "[vout]");
  } else {
    args.push("-map", `0:${request.videoTrackIndex}`);
  }
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

  // A bitmap subtitle's last cue can report a bogus multi-hundred-hour
  // duration, and the `overlay` filter used to burn it in defaults to running
  // until its longest input finishes.
  //
  // Primary fix: `-t <probed source duration>` hard-caps the output at the
  // real length established *before* encoding (ffprobe's container-level
  // duration, captured in `durationSeconds`), independent of whatever the
  // filtergraph thinks the subtitle input's length is, and independent of
  // whether an audio track is even mapped. That last part matters: `-shortest`
  // alone (see below) is a no-op whenever no audio track is selected — the
  // filtered video ends up as the *only* mapped output stream, so there's
  // nothing shorter for it to stop against, and the multi-hundred-hour
  // duration comes right back.
  //
  // Secondary: `-shortest` still caps at the muxer level once the shortest
  // *mapped* stream finishes, which additionally trims to a real audio
  // track's length when that audio happens to end before the video does
  // (verified against a real MakeMKV PGS rip — see PROJECT_STATUS.md).
  //
  // Deliberately not `overlay=shortest=1`: that filter option ends the whole
  // filtergraph as soon as framesync considers either input "exhausted",
  // which for a sparse subtitle stream can fire right after its last cue is
  // consumed — well before the video ends — truncating the output and
  // dropping subtitle compositing entirely (confirmed against a real Plex
  // playback).
  //
  // Deliberately *not* paired with `-fix_sub_duration`: that option was
  // tried too, but empirically (verified against a real MakeMKV PGS rip —
  // see PROJECT_STATUS.md) it breaks `overlay`'s subtitle compositing
  // outright, so nothing burns in at all.
  if (hasBitmapBurnTrack(request)) {
    if (request.durationSeconds !== undefined && request.durationSeconds > 0) {
      args.push("-t", String(request.durationSeconds));
    }
    args.push("-shortest");
  }

  args.push(request.outputPath);

  return args;
}

/** Whether burning in the selected subtitle tracks requires the `overlay`-based filter_complex graph. */
function hasBitmapBurnTrack(request: EncodeRequest): boolean {
  if (request.subtitle.mode !== "burn") return false;
  return request.subtitle.trackIndexes.some((index) => {
    const track = request.subtitleTracks!.find((t) => t.index === index)!;
    return isBitmapSubtitleCodec(track.codec);
  });
}

function videoArgs(request: EncodeRequest): string[] {
  const { video } = request.preset;

  if (video.mode === "copy") {
    return ["-c:v", "copy"];
  }

  const encoder = video.codec === "h264" ? "libx264" : "libx265";
  const args = ["-c:v", encoder, "-crf", String(video.crf), "-preset", video.preset];

  if (request.subtitle.mode === "burn") {
    if (hasBitmapBurnTrack(request)) {
      args.push("-filter_complex", buildBurnFilterComplex(request));
    } else {
      const path = escapeForSubtitlesFilter(request.inputPath);
      const filters = request.subtitle.trackIndexes.map((index) => {
        const ordinal = request.subtitleTracks!.findIndex((t) => t.index === index);
        return `subtitles='${path}':si=${ordinal}`;
      });
      args.push("-vf", filters.join(","));
    }
  }

  return args;
}

/**
 * Builds a `-filter_complex` graph that burns in every selected subtitle
 * track in order, mixing text (via `subtitles`) and bitmap (via `overlay`)
 * tracks as needed. Used instead of `-vf` whenever at least one burn track
 * is bitmap-based, since `overlay` needs a second input pad that `-vf` can't
 * express.
 */
function buildBurnFilterComplex(request: EncodeRequest): string {
  const path = escapeForSubtitlesFilter(request.inputPath);
  const indexes = request.subtitle.trackIndexes;
  const steps: string[] = [];
  let current = `[0:${request.videoTrackIndex}]`;

  indexes.forEach((index, i) => {
    const ordinal = request.subtitleTracks!.findIndex((t) => t.index === index);
    const track = request.subtitleTracks!.find((t) => t.index === index)!;
    const outLabel = i === indexes.length - 1 ? "[vout]" : `[v${i}]`;

    if (isBitmapSubtitleCodec(track.codec)) {
      steps.push(`${current}[0:s:${ordinal}]overlay${outLabel}`);
    } else {
      steps.push(`${current}subtitles='${path}':si=${ordinal}${outLabel}`);
    }
    current = outLabel;
  });

  return steps.join(";");
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
