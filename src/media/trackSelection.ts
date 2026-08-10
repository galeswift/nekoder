import type { AudioTrack, MediaFile, SubtitleTrack } from "./types";
import { isBurnableSubtitleCodec } from "./ffmpegCommand";

/** Titles matching these keywords are treated as commentary and skipped. */
const COMMENTARY_KEYWORDS = ["commentary", "director", "cast", "crew"];

function isCommentaryTrack(track: { title?: string }): boolean {
  if (!track.title) return false;
  const lower = track.title.toLowerCase();
  return COMMENTARY_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export interface TrackSelectionResult<T> {
  track: T | undefined;
  reason: string;
}

/**
 * Picks a single audio track: skip commentary tracks, prefer the configured
 * language, and prefer whichever track is flagged as default. No scoring —
 * just straightforward, in-order filtering.
 */
export function selectAudioTrack(
  tracks: AudioTrack[],
  preferredLanguage: string,
): TrackSelectionResult<AudioTrack> {
  if (tracks.length === 0) {
    return { track: undefined, reason: "No audio tracks available." };
  }

  const nonCommentary = tracks.filter((t) => !isCommentaryTrack(t));
  const pool = nonCommentary.length > 0 ? nonCommentary : tracks;
  const inLanguage = pool.filter((t) => t.language === preferredLanguage);
  const candidates = inLanguage.length > 0 ? inLanguage : pool;
  const track = candidates.find((t) => t.disposition.default) ?? candidates[0]!;

  return { track, reason: `Selected stream ${track.index}.` };
}

export interface SubtitleTrackGroupSelection {
  tracks: SubtitleTrack[];
  reason: string;
}

/**
 * Picks every non-commentary subtitle track in the configured language to
 * copy into the output. Tracks with no language tag are included too, since
 * many rips don't tag subtitle language at all.
 */
export function selectSubtitleTracksForCopy(
  tracks: SubtitleTrack[],
  preferredLanguage: string,
): SubtitleTrackGroupSelection {
  const candidates = tracks.filter(
    (t) => !isCommentaryTrack(t) && (t.language === preferredLanguage || t.language === undefined),
  );

  if (candidates.length === 0) {
    return { tracks: [], reason: "No subtitle tracks found." };
  }

  return {
    tracks: candidates,
    reason: `Selected ${candidates.length} subtitle track(s): ${candidates.map((t) => t.index).join(", ")}.`,
  };
}

/**
 * Picks every non-commentary, burnable subtitle track in the configured
 * language to burn into the video. Anime rips commonly split dialogue and
 * signs/songs into separate tracks that are both meant to be visible, so
 * burning in every matching track (rather than guessing at the "best" one)
 * is what actually reproduces what the source intended viewers to see.
 */
export function selectBurnSubtitleTracks(
  tracks: SubtitleTrack[],
  preferredLanguage: string,
): SubtitleTrackGroupSelection {
  const candidates = tracks.filter(
    (t) =>
      isBurnableSubtitleCodec(t.codec) &&
      !isCommentaryTrack(t) &&
      (t.language === preferredLanguage || t.language === undefined),
  );

  if (candidates.length === 0) {
    return { tracks: [], reason: `No burnable ${preferredLanguage} subtitle tracks found.` };
  }

  return {
    tracks: candidates,
    reason: `Burning in ${candidates.length} subtitle track(s): ${candidates.map((t) => t.index).join(", ")}.`,
  };
}

export interface TrackSelectionPreferences {
  audioLanguage: string;
  subtitleLanguage: string;
}

export interface TrackSelection {
  audio: TrackSelectionResult<AudioTrack>;
  subtitle: SubtitleTrackGroupSelection;
}

/** Selects an audio track and the subtitle tracks to burn in, together. */
export function selectTracks(media: MediaFile, preferences: TrackSelectionPreferences): TrackSelection {
  return {
    audio: selectAudioTrack(media.audioTracks, preferences.audioLanguage),
    subtitle: selectBurnSubtitleTracks(media.subtitleTracks, preferences.subtitleLanguage),
  };
}
