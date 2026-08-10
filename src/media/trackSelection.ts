import type { AudioTrack, MediaFile, SubtitleTrack } from "./types";

/**
 * Conservative string heuristics for track titles. These are intentionally
 * kept as simple, editable keyword lists rather than a scoring framework —
 * tune them here when a real file exposes a title ffmpeg/MakeMKV didn't tag
 * the way we expected.
 */
export const TITLE_KEYWORDS = {
  commentary: ["commentary", "director", "cast", "crew"],
  signsSongs: ["signs", "songs", "signs & songs", "signs and songs", "s&s"],
  forced: ["forced"],
  dub: ["dub", "dubbed", "english dub"],
  sdh: ["sdh", "hard of hearing"],
  fullDialogue: ["full", "dialogue", "dialog", "main"],
};

function titleContainsAny(title: string | undefined, keywords: string[]): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

export interface TrackScore<T> {
  track: T;
  score: number;
  reasons: string[];
}

export interface TrackSelectionResult<T> {
  track: T | undefined;
  reason: string;
  candidates: TrackScore<T>[];
}

function bestCandidate<T>(candidates: TrackScore<T>[]): TrackScore<T> | undefined {
  return candidates.reduce<TrackScore<T> | undefined>((best, candidate) => {
    if (best === undefined || candidate.score > best.score) return candidate;
    return best;
  }, undefined);
}

function scoreAudioTrack(track: AudioTrack, preferredLanguage: string): TrackScore<AudioTrack> {
  let score = 0;
  const reasons: string[] = [];
  const isCommentary = titleContainsAny(track.title, TITLE_KEYWORDS.commentary);

  if (isCommentary) {
    score -= 1000;
    reasons.push("commentary track (avoided)");
  }

  if (track.language === preferredLanguage) {
    score += 100;
    reasons.push(`language is ${preferredLanguage}`);
  } else if (track.language === undefined) {
    reasons.push("language unknown");
  } else {
    score -= 50;
    reasons.push(`language is ${track.language}, not ${preferredLanguage}`);
  }

  if (track.disposition.default) {
    score += 10;
    reasons.push("marked as default track");
  }

  if (!isCommentary && track.title === undefined) {
    // Untitled, non-commentary tracks are the common case for a plain
    // program audio track — treat neutrally rather than penalizing.
    reasons.push("no title metadata");
  }

  return { track, score, reasons };
}

/**
 * Selects the best audio track using anime-specific priorities:
 * 1. Prefer the configured language (normally Japanese).
 * 2. Avoid commentary tracks.
 * 3. Prefer the track marked as default.
 * 4. Fall back gracefully when language metadata is missing rather than
 *    refusing to pick anything.
 */
export function selectAudioTrack(
  tracks: AudioTrack[],
  preferredLanguage: string,
): TrackSelectionResult<AudioTrack> {
  const candidates = tracks.map((track) => scoreAudioTrack(track, preferredLanguage));
  const best = bestCandidate(candidates);

  if (best === undefined) {
    return { track: undefined, reason: "No audio tracks available.", candidates };
  }

  const reason = `Selected stream ${best.track.index} because ${best.reasons.join(", ")}.`;
  return { track: best.track, reason, candidates };
}

function scoreSubtitleTrack(
  track: SubtitleTrack,
  preferredLanguage: string,
): TrackScore<SubtitleTrack> {
  let score = 0;
  const reasons: string[] = [];

  const isCommentary = titleContainsAny(track.title, TITLE_KEYWORDS.commentary);
  const looksSignsSongs = titleContainsAny(track.title, TITLE_KEYWORDS.signsSongs);
  const looksForcedByTitle = titleContainsAny(track.title, TITLE_KEYWORDS.forced);
  const looksFullDialogue = titleContainsAny(track.title, TITLE_KEYWORDS.fullDialogue);
  const isForced = track.disposition.forced || looksForcedByTitle;

  if (isCommentary) {
    score -= 1000;
    reasons.push("commentary track (avoided)");
  }

  if (track.language === preferredLanguage) {
    score += 100;
    reasons.push(`is ${preferredLanguage}`);
  } else if (track.language === undefined) {
    reasons.push("language unknown");
  } else {
    score -= 50;
    reasons.push(`language is ${track.language}, not ${preferredLanguage}`);
  }

  if (isForced) {
    score -= 30;
    reasons.push("forced-only");
  } else {
    reasons.push("non-forced");
  }

  if (looksSignsSongs) {
    score -= 40;
    reasons.push("appears to be signs/songs only");
  }

  if (looksFullDialogue) {
    score += 20;
    reasons.push("appears to be the full subtitle track");
  }

  if (track.disposition.default) {
    score += 5;
    reasons.push("marked as default track");
  }

  return { track, score, reasons };
}

/**
 * Selects the best subtitle track using anime-specific priorities:
 * 1. Prefer the configured language (normally English).
 * 2. Prefer full-dialogue tracks over signs/songs-only tracks.
 * 3. Prefer non-forced over forced-only tracks.
 * 4. Avoid commentary subtitles.
 * 5. Fall back gracefully when metadata is incomplete or absent.
 */
export function selectSubtitleTrack(
  tracks: SubtitleTrack[],
  preferredLanguage: string,
): TrackSelectionResult<SubtitleTrack> {
  const candidates = tracks.map((track) => scoreSubtitleTrack(track, preferredLanguage));
  const best = bestCandidate(candidates);

  if (best === undefined) {
    return { track: undefined, reason: "No subtitle tracks available.", candidates };
  }

  const reason = `Selected stream ${best.track.index} because it is ${best.reasons.join(", ")}.`;
  return { track: best.track, reason, candidates };
}

export interface SubtitleTrackGroupSelection {
  tracks: SubtitleTrack[];
  reason: string;
}

/**
 * Selects subtitle tracks to copy together: the best full-dialogue track,
 * plus a separate signs/songs track if the source splits them out. Anime
 * releases commonly ship dialogue and signs/songs as two distinct tracks
 * that are meant to be watched together, so copying only the higher-scoring
 * one (as selectSubtitleTrack does, for the single-track burn-in case)
 * silently drops on-screen text and song translations.
 */
export function selectSubtitleTracksForCopy(
  tracks: SubtitleTrack[],
  preferredLanguage: string,
): SubtitleTrackGroupSelection {
  const primary = selectSubtitleTrack(tracks, preferredLanguage);
  if (!primary.track) {
    return { tracks: [], reason: primary.reason };
  }

  const signsSongsTrack = tracks.find(
    (track) =>
      track.index !== primary.track!.index &&
      !titleContainsAny(track.title, TITLE_KEYWORDS.commentary) &&
      titleContainsAny(track.title, TITLE_KEYWORDS.signsSongs) &&
      (track.language === preferredLanguage || track.language === undefined),
  );

  if (!signsSongsTrack) {
    return { tracks: [primary.track], reason: primary.reason };
  }

  return {
    tracks: [primary.track, signsSongsTrack],
    reason: `${primary.reason} Also including stream ${signsSongsTrack.index} ("${signsSongsTrack.title}") for signs/songs.`,
  };
}

export interface TrackSelectionPreferences {
  audioLanguage: string;
  subtitleLanguage: string;
}

export interface TrackSelection {
  audio: TrackSelectionResult<AudioTrack>;
  subtitle: TrackSelectionResult<SubtitleTrack>;
}

export function selectTracks(
  media: MediaFile,
  preferences: TrackSelectionPreferences,
): TrackSelection {
  return {
    audio: selectAudioTrack(media.audioTracks, preferences.audioLanguage),
    subtitle: selectSubtitleTrack(media.subtitleTracks, preferences.subtitleLanguage),
  };
}
