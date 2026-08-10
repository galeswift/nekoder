import type { QueueItem } from "./queueItem";
import { assignSequenceNumbers } from "../media/plexNaming";
import {
  computeItemPlexFilename,
  computeItemPlexRelativeDir,
  defaultGroupConfig,
  groupKeyForFile,
  type PlexGroupConfig,
} from "./plexGroups";

export function isInProgressOrDone(item: QueueItem): boolean {
  return item.status === "encoding" || item.status === "complete";
}

/** Items eligible to participate in a group's episode/extra numbering: successfully probed, regardless of status (including completed/encoding). */
export function itemsForNumbering(items: QueueItem[]): QueueItem[] {
  return items.filter((item) => item.media !== undefined);
}

/** Items whose output path/status should actually be recomputed and written back to state. */
export function itemsToRecompute(items: QueueItem[]): QueueItem[] {
  return itemsForNumbering(items).filter((item) => !isInProgressOrDone(item));
}

/** Items eligible to be queued for encoding right now. */
export function startQueueCandidates(items: QueueItem[]): QueueItem[] {
  return itemsToRecompute(items).filter((item) => item.videoTrackIndex !== undefined);
}

export interface PlexPath {
  dirSegments: string[];
  filename: string;
}

/**
 * Groups items by source folder and, for every group with Plex naming
 * enabled, assigns sequential episode/extra numbers and computes the
 * resulting Plex destination per item. Numbering is computed from
 * itemsForNumbering (every successfully probed item, including
 * completed/encoding ones) so that renumbering doesn't happen just because
 * an earlier episode finished encoding or a later file failed to probe.
 * Groups with Plex naming disabled map their items to undefined, meaning
 * "fall back to the non-Plex output path".
 */
export function computeGroupPlexPaths(
  items: QueueItem[],
  groups: Record<string, PlexGroupConfig>,
): Map<string, PlexPath | undefined> {
  const result = new Map<string, PlexPath | undefined>();
  const byGroup = new Map<string, QueueItem[]>();
  for (const item of itemsForNumbering(items)) {
    const key = groupKeyForFile(item.inputPath);
    const list = byGroup.get(key) ?? [];
    list.push(item);
    byGroup.set(key, list);
  }

  for (const [key, groupItems] of byGroup) {
    const group = groups[key] ?? defaultGroupConfig(key);
    if (!group.enabled) {
      for (const item of groupItems) result.set(item.id, undefined);
      continue;
    }
    const assignments = assignSequenceNumbers(
      groupItems.map((it) => ({ id: it.id, kind: it.plexKind })),
      group.startEpisode,
    );
    for (const item of groupItems) {
      const assignment = assignments.get(item.id);
      const filename = computeItemPlexFilename(
        {
          kind: item.plexKind,
          filenameOverride: item.plexFilenameOverride,
          episode: assignment?.episode,
          extraIndex: assignment?.extraIndex,
        },
        group,
      );
      result.set(item.id, { dirSegments: computeItemPlexRelativeDir(item.plexKind, group), filename });
    }
  }
  return result;
}
