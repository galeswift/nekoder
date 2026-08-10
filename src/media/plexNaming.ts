export type PlexKind = "episode" | "movie" | "extra";

/** Files at or above this duration default to "movie". */
export const MOVIE_DURATION_THRESHOLD_SECONDS = 60 * 60;
/** Files at or below this duration default to "extra". */
export const EXTRA_DURATION_THRESHOLD_SECONDS = 5 * 60;

export function classifyByDuration(durationSeconds: number | undefined): PlexKind {
  if (durationSeconds === undefined) return "episode";
  if (durationSeconds >= MOVIE_DURATION_THRESHOLD_SECONDS) return "movie";
  if (durationSeconds <= EXTRA_DURATION_THRESHOLD_SECONDS) return "extra";
  return "episode";
}

const NOISE_PATTERNS: RegExp[] = [
  /\bBD[-\s]?\d+\b/gi,
  // No leading \b: rip tools often glue this directly onto the show name
  // (e.g. "K-ONComplete18").
  /Complete\d*/gi,
  /\bSeason\s*\d+(\s*\+\s*\d+)*\b/gi,
  /\bExtras?\b/gi,
  /\bdisc\s*\d+\b/gi,
  /\btitle\b/gi,
];

/** Best-effort show-name guess from a rip folder name, e.g. "K-ONComplete18 BD-7" -> "K-ON". */
export function guessShowName(folderName: string): string {
  let cleaned = folderName;
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }
  // Trailing disc/part numbers left dangling after the noise patterns above
  // (e.g. "Robotech 1", "Robotech Extras 1" -> "Robotech").
  cleaned = cleaned.replace(/\s+\d+\s*$/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/^[\s\-_]+|[\s\-_]+$/g, "");
  return cleaned.length > 0 ? cleaned : folderName.trim();
}

const INVALID_PATH_CHARS = /[\\/:*?"<>|]/g;

/** Strips characters/sequences that are unsafe as a single path segment. */
export function sanitizePathSegment(text: string): string {
  let cleaned = text.replace(INVALID_PATH_CHARS, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/\.+$/g, "").trim();
  // Reject traversal/empty segments outright rather than trying to repair them.
  if (cleaned === "" || cleaned === "." || cleaned === "..") return "_";
  return cleaned;
}

/** Clamps to a finite positive integer (rounding), defaulting invalid input to 1. */
export function normalizePositiveInteger(value: number, fallback = 1): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

function pad2(n: number): string {
  return String(normalizePositiveInteger(n)).padStart(2, "0");
}

export interface PlexRelativeDirInput {
  showName: string;
  kind: PlexKind;
}

export function buildPlexRelativeDir(input: PlexRelativeDirInput): string[] {
  const show = sanitizePathSegment(input.showName);
  if (input.kind === "extra") return [show, "Extras"];
  return [show];
}

export interface PlexFilenameInput {
  showName: string;
  kind: PlexKind;
  season?: number;
  episode?: number;
  extraIndex?: number;
}

export function buildPlexFilename(input: PlexFilenameInput): string {
  const show = sanitizePathSegment(input.showName);
  if (input.kind === "movie") return `${show}.mkv`;
  if (input.kind === "extra") return `${show} - extra-${pad2(input.extraIndex ?? 1)}.mkv`;
  const season = pad2(input.season ?? 1);
  const episode = pad2(input.episode ?? 1);
  return `${show} - s${season}e${episode}.mkv`;
}

export interface SequenceItem {
  id: string;
  kind: PlexKind;
}

export interface SequenceAssignment {
  episode?: number;
  extraIndex?: number;
}

/** Strips a trailing .mkv (case-insensitive) so callers can re-append it. */
function stripMkvExtension(name: string): string {
  return name.replace(/\.mkv$/i, "");
}

/** Sanitizes free-typed filename text and ensures it ends in .mkv. */
export function finalizeFilename(name: string): string {
  const sanitized = sanitizePathSegment(stripMkvExtension(name));
  return `${sanitized}.mkv`;
}

/**
 * Assigns sequential episode numbers (starting at startEpisode) to "episode"
 * items and sequential 1-based indexes to "extra" items, in the given order.
 * "movie" items are skipped entirely.
 */
export function assignSequenceNumbers(
  items: SequenceItem[],
  startEpisode: number,
): Map<string, SequenceAssignment> {
  const result = new Map<string, SequenceAssignment>();
  let nextEpisode = startEpisode;
  let nextExtra = 1;
  for (const item of items) {
    if (item.kind === "episode") {
      result.set(item.id, { episode: nextEpisode });
      nextEpisode += 1;
    } else if (item.kind === "extra") {
      result.set(item.id, { extraIndex: nextExtra });
      nextExtra += 1;
    }
  }
  return result;
}
