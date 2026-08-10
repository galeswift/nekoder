export type PresetId = "plex-h264" | "plex-hevc" | "remux";

export type VideoEncodeSettings =
  | { mode: "copy" }
  | { mode: "encode"; codec: "h264" | "hevc"; crf: number; preset: string };

export type AudioEncodeSettings =
  | { mode: "copy" }
  | { mode: "encode"; codec: "aac" | "ac3"; bitrateKbps: number };

export interface EncodingPreset {
  id: PresetId;
  name: string;
  description: string;
  video: VideoEncodeSettings;
  audio: AudioEncodeSettings;
}

/**
 * Data-driven preset definitions. Adjust CRF/bitrate/encoder-preset values
 * here directly rather than building a plug-in system around them.
 */
export const PRESETS: Record<PresetId, EncodingPreset> = {
  "plex-h264": {
    id: "plex-h264",
    name: "Plex Compatible H.264",
    description: "Maximum compatibility across Plex clients. H.264 video, AAC audio.",
    video: { mode: "encode", codec: "h264", crf: 20, preset: "medium" },
    audio: { mode: "encode", codec: "aac", bitrateKbps: 256 },
  },
  "plex-hevc": {
    id: "plex-hevc",
    name: "Plex HEVC",
    description: "Smaller files using H.265/HEVC. Requires HEVC-capable Plex clients.",
    video: { mode: "encode", codec: "hevc", crf: 22, preset: "medium" },
    audio: { mode: "encode", codec: "aac", bitrateKbps: 256 },
  },
  remux: {
    id: "remux",
    name: "Remux / Copy",
    description: "No transcoding. Copies video, audio, and subtitles as-is into an MKV container.",
    video: { mode: "copy" },
    audio: { mode: "copy" },
  },
};

export const DEFAULT_PRESET_ID: PresetId = "plex-h264";
