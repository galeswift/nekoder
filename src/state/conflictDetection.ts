/**
 * Given a set of queue items about to be encoded, returns the ids of every
 * item whose output path collides with another item's — e.g. two flattened
 * files that share a filename. Both items in a collision are flagged, since
 * neither should silently win.
 *
 * `caseSensitive` should reflect the destination filesystem: false (the
 * default) treats "Episode.mkv" and "episode.mkv" as the same path, matching
 * Windows/macOS's default case-insensitive filesystems; pass true on
 * case-sensitive filesystems (typically Linux) so same-name-different-case
 * paths aren't flagged as conflicts.
 */
export function findDuplicateOutputPaths(
  items: { id: string; outputPath: string }[],
  options: { caseSensitive?: boolean } = {},
): Set<string> {
  const normalize = options.caseSensitive ? (p: string) => p : (p: string) => p.toLowerCase();
  const firstSeenBy = new Map<string, string>();
  const duplicateIds = new Set<string>();

  for (const item of items) {
    const key = normalize(item.outputPath);
    const existingId = firstSeenBy.get(key);
    if (existingId !== undefined) {
      duplicateIds.add(existingId);
      duplicateIds.add(item.id);
    } else {
      firstSeenBy.set(key, item.id);
    }
  }

  return duplicateIds;
}
