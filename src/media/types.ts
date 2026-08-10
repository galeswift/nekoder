export interface TrackDisposition {
  default: boolean;
  forced: boolean;
}

export interface VideoTrack {
  index: number;
  codec: string;
  width: number | undefined;
  height: number | undefined;
  disposition: TrackDisposition;
}

export interface AudioTrack {
  index: number;
  codec: string;
  language: string | undefined;
  title: string | undefined;
  channels: number | undefined;
  channelLayout: string | undefined;
  disposition: TrackDisposition;
}

export interface SubtitleTrack {
  index: number;
  codec: string;
  language: string | undefined;
  title: string | undefined;
  disposition: TrackDisposition;
}

export interface MediaFile {
  path: string;
  durationSeconds: number | undefined;
  videoTracks: VideoTrack[];
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
}
