import type { AudioTrack, MediaFile, SubtitleTrack, TrackDisposition, VideoTrack } from "./types";

/**
 * Shape of raw `ffprobe -show_streams -show_format -of json` output.
 * Only the fields we actually read are declared; everything is optional
 * because real-world files frequently omit tags ffprobe would otherwise emit.
 */
export interface RawFfprobeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  channels?: number;
  channel_layout?: string;
  duration?: string;
  disposition?: {
    default?: number;
    forced?: number;
  };
  tags?: {
    language?: string;
    title?: string;
    [key: string]: string | undefined;
  };
}

export interface RawFfprobeFormat {
  duration?: string;
}

export interface RawFfprobeOutput {
  streams?: RawFfprobeStream[];
  format?: RawFfprobeFormat;
}

function toFiniteNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeDisposition(disposition: RawFfprobeStream["disposition"]): TrackDisposition {
  return {
    default: disposition?.default === 1,
    forced: disposition?.forced === 1,
  };
}

function normalizeLanguage(language: string | undefined): string | undefined {
  if (!language) return undefined;
  const trimmed = language.trim().toLowerCase();
  if (trimmed === "" || trimmed === "und" || trimmed === "undefined") return undefined;
  return trimmed;
}

function normalizeTitle(title: string | undefined): string | undefined {
  if (title === undefined) return undefined;
  const trimmed = title.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Converts raw ffprobe JSON into application-owned types. Never throws on
 * missing fields; anything absent or malformed becomes `undefined` so
 * downstream logic must handle it explicitly rather than assume presence.
 */
export function normalizeMediaFile(path: string, raw: RawFfprobeOutput): MediaFile {
  const streams = raw.streams ?? [];

  const videoTracks: VideoTrack[] = [];
  const audioTracks: AudioTrack[] = [];
  const subtitleTracks: SubtitleTrack[] = [];

  for (const stream of streams) {
    const disposition = normalizeDisposition(stream.disposition);
    const codec = stream.codec_name ?? "unknown";

    switch (stream.codec_type) {
      case "video":
        videoTracks.push({
          index: stream.index,
          codec,
          width: stream.width,
          height: stream.height,
          disposition,
        });
        break;
      case "audio":
        audioTracks.push({
          index: stream.index,
          codec,
          language: normalizeLanguage(stream.tags?.language),
          title: normalizeTitle(stream.tags?.title),
          channels: stream.channels,
          channelLayout: stream.channel_layout,
          disposition,
        });
        break;
      case "subtitle":
        subtitleTracks.push({
          index: stream.index,
          codec,
          language: normalizeLanguage(stream.tags?.language),
          title: normalizeTitle(stream.tags?.title),
          disposition,
        });
        break;
      default:
        break;
    }
  }

  return {
    path,
    durationSeconds: toFiniteNumber(raw.format?.duration),
    videoTracks,
    audioTracks,
    subtitleTracks,
  };
}
