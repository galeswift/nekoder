import { describe, expect, it } from "vitest";
import { createQueueItem, type QueueItem } from "./queueItem";
import { defaultGroupConfig, groupKeyForFile, type PlexGroupConfig } from "./plexGroups";
import { computeGroupPlexPaths, isInProgressOrDone, itemsForNumbering, itemsToRecompute, startQueueCandidates } from "./plexRecompute";
import type { MediaFile } from "../media/types";

function fakeMedia(): MediaFile {
  return { path: "x", durationSeconds: 1400, videoTracks: [], audioTracks: [], subtitleTracks: [] };
}

function makeItem(overrides: Partial<QueueItem> & { inputPath: string }): QueueItem {
  const base = createQueueItem({ path: overrides.inputPath, sourceRoot: "D:\\Video\\Show" }, "plex-h264");
  return { ...base, media: fakeMedia(), ...overrides };
}

function groupsFor(items: QueueItem[]): Record<string, PlexGroupConfig> {
  const groups: Record<string, PlexGroupConfig> = {};
  for (const item of items) {
    const key = groupKeyForFile(item.inputPath);
    if (!(key in groups)) groups[key] = defaultGroupConfig(key);
  }
  return groups;
}

describe("itemsForNumbering / itemsToRecompute / startQueueCandidates", () => {
  it("keeps completed and encoding items in the numbering set", () => {
    const items = [
      makeItem({ inputPath: "D:\\Video\\Show\\a.mkv", status: "complete" }),
      makeItem({ inputPath: "D:\\Video\\Show\\b.mkv", status: "encoding" }),
      makeItem({ inputPath: "D:\\Video\\Show\\c.mkv", status: "ready" }),
    ];
    expect(itemsForNumbering(items).map((i) => i.id)).toEqual(items.map((i) => i.id));
  });

  it("excludes unprobed items (no media) from numbering", () => {
    const probed = makeItem({ inputPath: "D:\\Video\\Show\\a.mkv", status: "ready" });
    const unprobed = { ...makeItem({ inputPath: "D:\\Video\\Show\\b.mkv" }), media: undefined, status: "error" as const };
    expect(itemsForNumbering([probed, unprobed]).map((i) => i.id)).toEqual([probed.id]);
  });

  it("excludes in-progress/done items from the recompute set but keeps them for numbering", () => {
    const complete = makeItem({ inputPath: "D:\\Video\\Show\\a.mkv", status: "complete" });
    const ready = makeItem({ inputPath: "D:\\Video\\Show\\b.mkv", status: "ready" });
    expect(itemsToRecompute([complete, ready]).map((i) => i.id)).toEqual([ready.id]);
    expect(itemsForNumbering([complete, ready]).map((i) => i.id)).toEqual([complete.id, ready.id]);
  });

  it("start-queue candidates require a resolved video track", () => {
    const withTrack = makeItem({ inputPath: "D:\\Video\\Show\\a.mkv", status: "ready", videoTrackIndex: 0 });
    const withoutTrack = makeItem({ inputPath: "D:\\Video\\Show\\b.mkv", status: "ready", videoTrackIndex: undefined });
    expect(startQueueCandidates([withTrack, withoutTrack]).map((i) => i.id)).toEqual([withTrack.id]);
  });
});

describe("computeGroupPlexPaths — stable numbering across status changes", () => {
  it("does not renumber a newly added file to episode 1 after earlier episodes complete", () => {
    const completed = [
      makeItem({ inputPath: "D:\\Video\\Show\\a.mkv", status: "complete", plexKind: "episode" }),
      makeItem({ inputPath: "D:\\Video\\Show\\b.mkv", status: "complete", plexKind: "episode" }),
      makeItem({ inputPath: "D:\\Video\\Show\\c.mkv", status: "complete", plexKind: "episode" }),
    ];
    const newItem = makeItem({ inputPath: "D:\\Video\\Show\\d.mkv", status: "ready", plexKind: "episode" });
    const items = [...completed, newItem];
    const groups = groupsFor(items);

    const paths = computeGroupPlexPaths(items, groups);
    expect(paths.get(newItem.id)?.filename).toMatch(/e04\.mkv$/);
  });

  it("a failed probe does not shift numbering for its siblings, and the UI/output-path numbering sets agree", () => {
    const ok1 = makeItem({ inputPath: "D:\\Video\\Show\\a.mkv", status: "ready", plexKind: "episode" });
    const failed = { ...makeItem({ inputPath: "D:\\Video\\Show\\b.mkv" }), media: undefined, status: "error" as const };
    const ok2 = makeItem({ inputPath: "D:\\Video\\Show\\c.mkv", status: "ready", plexKind: "episode" });
    const items = [ok1, failed, ok2];
    const groups = groupsFor(items);

    const paths = computeGroupPlexPaths(items, groups);
    // The failed item never got a media probe, so it's excluded entirely
    // (both from the numbering set used for output paths and from what the
    // UI would show), and the still-probed sibling gets episode 2, not 3.
    expect(paths.has(failed.id)).toBe(false);
    expect(paths.get(ok2.id)?.filename).toMatch(/e02\.mkv$/);
  });

  it("restarting with some items already complete keeps remaining items numbered after them, not renumbered from the start", () => {
    const done = makeItem({ inputPath: "D:\\Video\\Show\\a.mkv", status: "complete", plexKind: "episode" });
    const pending1 = makeItem({ inputPath: "D:\\Video\\Show\\b.mkv", status: "ready", plexKind: "episode" });
    const pending2 = makeItem({ inputPath: "D:\\Video\\Show\\c.mkv", status: "ready", plexKind: "episode" });
    const items = [done, pending1, pending2];
    const groups = groupsFor(items);

    const paths = computeGroupPlexPaths(items, groups);
    expect(paths.get(pending1.id)?.filename).toMatch(/e02\.mkv$/);
    expect(paths.get(pending2.id)?.filename).toMatch(/e03\.mkv$/);
  });
});

describe("isInProgressOrDone", () => {
  it("treats encoding and complete as in-progress/done", () => {
    expect(isInProgressOrDone(makeItem({ inputPath: "a", status: "encoding" }))).toBe(true);
    expect(isInProgressOrDone(makeItem({ inputPath: "a", status: "complete" }))).toBe(true);
    expect(isInProgressOrDone(makeItem({ inputPath: "a", status: "ready" }))).toBe(false);
  });
});
