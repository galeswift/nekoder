import { useEffect, useRef, useState } from "react";
import type { PresetId } from "../media/presets";
import type { SubtitleMode } from "../media/ffmpegCommand";
import type { AppSettings } from "../settings/types";
import type { DiscoveredFile, FfmpegToolsStatus, LogEvent, QueueEncodeItem } from "../ipc/api";
import { createQueueItem, deriveTrackSelection, type QueueItem, type QueueItemStatus } from "./queueItem";
import { findDuplicateOutputPaths } from "./conflictDetection";
import { selectBurnTrackIndexesOnModeChange } from "./burnTrackSelection";
import { assignSequenceNumbers, classifyByDuration, normalizePositiveInteger, type PlexKind } from "../media/plexNaming";
import {
  computeItemPlexFilename,
  defaultGroupConfig,
  folderLabelForGroupKey,
  groupKeyForFile,
  type PlexGroupConfig,
} from "./plexGroups";
import { computeGroupPlexPaths, itemsForNumbering, itemsToRecompute, startQueueCandidates } from "./plexRecompute";

export function useAppController() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionAnchorRef = useRef<string | undefined>(undefined);
  const [settings, setSettings] = useState<AppSettings | undefined>(undefined);
  const [toolsStatus, setToolsStatus] = useState<FfmpegToolsStatus | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [plexGroups, setPlexGroups] = useState<Record<string, PlexGroupConfig>>({});

  const settingsRef = useRef<AppSettings | undefined>(undefined);
  const itemsRef = useRef<QueueItem[]>([]);
  const plexGroupsRef = useRef<Record<string, PlexGroupConfig>>({});
  const startingRef = useRef(false);
  // Bumped on every recomputeAllOutputPaths call so a slower, older
  // in-flight recompute (e.g. from a keystroke a user has since typed over)
  // can detect it's stale and stop writing results instead of racing a
  // newer one.
  const recomputeGenerationRef = useRef(0);
  settingsRef.current = settings;
  itemsRef.current = items;
  plexGroupsRef.current = plexGroups;

  useEffect(() => {
    void (async () => {
      const loaded = await window.desktop.getSettings();
      setSettings(loaded);
      const tools = await window.desktop.checkFfmpegTools();
      setToolsStatus(tools);
      if (!tools.ffmpeg || !tools.ffprobe) setShowSettings(true);
    })();

    const offProgress = window.desktop.onEncodeProgress((event) => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === event.id
            ? {
                ...it,
                progress: {
                  percent: event.percent,
                  elapsedSeconds: event.elapsedSeconds,
                  speed: event.speed,
                  etaSeconds: event.etaSeconds,
                },
              }
            : it,
        ),
      );
    });

    const offStatus = window.desktop.onEncodeStatus((event) => {
      setItems((prev) =>
        prev.map((it) => (it.id === event.id ? { ...it, status: event.status, errorMessage: event.error } : it)),
      );
    });

    const offLog = window.desktop.onLog((event) => {
      setLogs((prev) => [...prev, event]);
    });

    return () => {
      offProgress();
      offStatus();
      offLog();
    };
  }, []);

  function updateItem(id: string, patch: Partial<QueueItem>): void {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function resolveOutputPath(
    item: QueueItem,
    currentSettings: AppSettings,
    plexPath?: { dirSegments: string[]; filename: string },
  ): Promise<{ outputPath: string | undefined; status: QueueItemStatus }> {
    if (!currentSettings.lastOutputDirectory) {
      return { outputPath: undefined, status: "ready" };
    }
    const { outputPath, exists } = await window.desktop.resolveOutputPath({
      sourceRoot: item.sourceRoot,
      filePath: item.inputPath,
      outputRoot: currentSettings.lastOutputDirectory,
      preserveStructure: currentSettings.preserveDirectoryStructure,
      plexPath,
    });
    return { outputPath, status: exists ? "conflict" : "ready" };
  }

  async function probeItem(item: QueueItem, currentSettings: AppSettings): Promise<QueueItem> {
    updateItem(item.id, { status: "probing" });
    const response = await window.desktop.probeMedia(item.inputPath);

    if (!response.ok) {
      const patch = { status: "error" as const, errorMessage: response.error };
      updateItem(item.id, patch);
      return { ...item, ...patch };
    }

    const derived = deriveTrackSelection(response.media, {
      audioLanguage: currentSettings.preferredAudioLanguage,
      subtitleLanguage: currentSettings.preferredSubtitleLanguage,
    });
    const outcome = await resolveOutputPath(item, currentSettings);
    const plexKind = classifyByDuration(response.media.durationSeconds);

    const patch = {
      media: response.media,
      ...derived,
      outputPath: outcome.outputPath,
      status: outcome.status,
      plexKind,
    };
    updateItem(item.id, patch);
    return { ...item, ...patch };
  }

  /**
   * Recomputes output paths for every eligible item. Numbering (via
   * computeGroupPlexPaths) is derived from every successfully probed item in
   * a group regardless of status — including already-completed/encoding
   * ones — so finishing an episode or a sibling failing to probe doesn't
   * renumber the rest of the group; only itemsToRecompute (not in-progress
   * or done) actually get their output path/status written back.
   *
   * itemsSnapshot defaults to itemsRef so callers after an awaited
   * settings/group update (which has already triggered a re-render) don't
   * need to pass it explicitly; callers mutating items synchronously in the
   * same tick should pass a fresh snapshot instead, since itemsRef only
   * updates on render.
   *
   * Guards against races between overlapping calls (e.g. rapid keystrokes
   * each triggering a recompute): once a newer call starts, this one detects
   * it's stale via recomputeGenerationRef and stops applying results.
   */
  async function recomputeAllOutputPaths(
    currentSettings: AppSettings,
    groups: Record<string, PlexGroupConfig>,
    itemsSnapshot: QueueItem[] = itemsRef.current,
  ): Promise<void> {
    const myGeneration = ++recomputeGenerationRef.current;
    const plexPaths = computeGroupPlexPaths(itemsSnapshot, groups);
    for (const item of itemsToRecompute(itemsSnapshot)) {
      const outcome = await resolveOutputPath(item, currentSettings, plexPaths.get(item.id));
      if (recomputeGenerationRef.current !== myGeneration) return;
      updateItem(item.id, { outputPath: outcome.outputPath, status: outcome.status });
    }
  }

  async function addDiscoveredFiles(discovered: DiscoveredFile[]): Promise<void> {
    const currentSettings = settingsRef.current;
    if (discovered.length === 0 || !currentSettings) return;

    const newItems = discovered.map((file) => createQueueItem(file, currentSettings.lastPresetId));
    setItems((prev) => [...prev, ...newItems]);

    const probedItems: QueueItem[] = [];
    for (const item of newItems) {
      probedItems.push(await probeItem(item, currentSettings));
    }

    let nextGroups = plexGroupsRef.current;
    for (const item of probedItems) {
      const key = groupKeyForFile(item.inputPath);
      if (!(key in nextGroups)) {
        nextGroups = { ...nextGroups, [key]: defaultGroupConfig(key) };
      }
    }
    if (nextGroups !== plexGroupsRef.current) setPlexGroups(nextGroups);

    // Merge over itemsRef.current rather than reading it alone: it may not
    // yet reflect every probeItem update from the loop above (state updates
    // land on re-render, not synchronously after each await).
    const merged = new Map(itemsRef.current.map((it) => [it.id, it]));
    for (const item of probedItems) merged.set(item.id, item);

    await recomputeAllOutputPaths(currentSettings, nextGroups, Array.from(merged.values()));
  }

  async function onAddFiles(): Promise<void> {
    const files = await window.desktop.openFiles();
    await addDiscoveredFiles(files);
  }

  async function onAddFolder(): Promise<void> {
    const files = await window.desktop.openFolder();
    await addDiscoveredFiles(files);
  }

  async function onChooseOutputFolder(): Promise<void> {
    const folder = await window.desktop.chooseOutputFolder();
    if (!folder) return;
    const updated = await window.desktop.updateSettings({ lastOutputDirectory: folder });
    setSettings(updated);
    await recomputeAllOutputPaths(updated, plexGroupsRef.current);
  }

  async function onUpdateSettings(partial: Partial<AppSettings>): Promise<void> {
    const updated = await window.desktop.updateSettings(partial);
    setSettings(updated);
    if (partial.preserveDirectoryStructure !== undefined) {
      await recomputeAllOutputPaths(updated, plexGroupsRef.current);
    }
  }

  async function onBrowseExecutable(kind: "ffmpeg" | "ffprobe"): Promise<void> {
    const chosenPath = await window.desktop.browseForExecutable(kind);
    if (!chosenPath) return;
    await onUpdateSettings(kind === "ffmpeg" ? { ffmpegPath: chosenPath } : { ffprobePath: chosenPath });
    const tools = await window.desktop.checkFfmpegTools();
    setToolsStatus(tools);
  }

  function onSelect(id: string, mode: "single" | "toggle" | "range" = "single"): void {
    if (mode === "range" && selectionAnchorRef.current) {
      const ids = itemsRef.current.map((it) => it.id);
      const anchorPos = ids.indexOf(selectionAnchorRef.current);
      const targetPos = ids.indexOf(id);
      if (anchorPos !== -1 && targetPos !== -1) {
        const [start, end] = anchorPos < targetPos ? [anchorPos, targetPos] : [targetPos, anchorPos];
        setSelectedIds(ids.slice(start, end + 1));
        return;
      }
    }
    if (mode === "toggle") {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
      selectionAnchorRef.current = id;
      return;
    }
    setSelectedIds([id]);
    selectionAnchorRef.current = id;
  }

  function onBulkChangeKind(itemIds: string[], kind: PlexKind): void {
    const idSet = new Set(itemIds);
    const nextItems = itemsRef.current.map((it) => (idSet.has(it.id) ? { ...it, plexKind: kind } : it));
    setItems(nextItems);
    if (settingsRef.current) void recomputeAllOutputPaths(settingsRef.current, plexGroupsRef.current, nextItems);
  }

  function onBulkChangeSeason(itemIds: string[], season: number): void {
    const idSet = new Set(itemIds);
    const affectedGroupKeys = new Set(
      itemsRef.current.filter((it) => idSet.has(it.id)).map((it) => groupKeyForFile(it.inputPath)),
    );
    const normalized = normalizePositiveInteger(season);
    let nextGroups = plexGroupsRef.current;
    for (const key of affectedGroupKeys) {
      const current = nextGroups[key] ?? defaultGroupConfig(key);
      nextGroups = { ...nextGroups, [key]: { ...current, season: normalized } };
    }
    setPlexGroups(nextGroups);
    if (settingsRef.current) void recomputeAllOutputPaths(settingsRef.current, nextGroups);
  }

  function onChangePreset(itemId: string, presetId: PresetId): void {
    updateItem(itemId, { presetId });
    if (settingsRef.current) void onUpdateSettings({ lastPresetId: presetId });
  }

  function onChangeAudioTrack(itemId: string, index: number): void {
    updateItem(itemId, { audioTrackIndex: index, audioReason: "Manually selected." });
  }

  function onChangeSubtitleMode(itemId: string, mode: SubtitleMode): void {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        if (mode === "none") {
          return { ...it, subtitle: { mode: "none", trackIndexes: [] }, subtitleReason: "Manually disabled." };
        }
        if (mode === "burn") {
          const trackIndexes = selectBurnTrackIndexesOnModeChange(it.subtitle, it.media?.subtitleTracks ?? []);
          return { ...it, subtitle: { mode: "burn", trackIndexes }, subtitleReason: "Manually selected." };
        }
        const trackIndexes = it.subtitle.mode === "none" ? [] : it.subtitle.trackIndexes;
        return { ...it, subtitle: { mode: "copy", trackIndexes }, subtitleReason: "Manually selected." };
      }),
    );
  }

  function onToggleSubtitleTrack(itemId: string, index: number): void {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId || (it.subtitle.mode !== "copy" && it.subtitle.mode !== "burn")) return it;
        const has = it.subtitle.trackIndexes.includes(index);
        const trackIndexes = has
          ? it.subtitle.trackIndexes.filter((i) => i !== index)
          : [...it.subtitle.trackIndexes, index];
        return { ...it, subtitle: { mode: it.subtitle.mode, trackIndexes }, subtitleReason: "Manually selected." };
      }),
    );
  }

  /** Returns this item's Plex naming group (per-folder settings), a display label, and the current computed suggestion. */
  function getPlexInfoForItem(item: QueueItem): {
    groupKey: string;
    groupLabel: string;
    group: PlexGroupConfig;
    assignedEpisode: number | undefined;
    assignedExtraIndex: number | undefined;
    suggestedFilename: string;
  } {
    const groupKey = groupKeyForFile(item.inputPath);
    const group = plexGroups[groupKey] ?? defaultGroupConfig(groupKey);
    // Matches the numbering set computeGroupPlexPaths uses for the actual
    // output path (itemsForNumbering: every probed item regardless of
    // status), so the UI's displayed episode number never disagrees with
    // what gets written to disk.
    const groupItems = itemsForNumbering(items).filter((it) => groupKeyForFile(it.inputPath) === groupKey);
    const assignments = assignSequenceNumbers(
      groupItems.map((it) => ({ id: it.id, kind: it.plexKind })),
      group.startEpisode,
    );
    const assignment = assignments.get(item.id);
    const suggestedFilename = computeItemPlexFilename(
      {
        kind: item.plexKind,
        filenameOverride: undefined,
        episode: assignment?.episode,
        extraIndex: assignment?.extraIndex,
      },
      group,
    );
    return {
      groupKey,
      groupLabel: folderLabelForGroupKey(groupKey),
      group,
      assignedEpisode: assignment?.episode,
      assignedExtraIndex: assignment?.extraIndex,
      suggestedFilename,
    };
  }

  /** Applies a patch to the Plex naming group that owns itemId, then recomputes affected output paths. */
  function updateGroupForItem(itemId: string, patch: Partial<PlexGroupConfig>): void {
    const item = itemsRef.current.find((it) => it.id === itemId);
    if (!item) return;
    const key = groupKeyForFile(item.inputPath);
    const current = plexGroupsRef.current[key] ?? defaultGroupConfig(key);
    const nextGroups = { ...plexGroupsRef.current, [key]: { ...current, ...patch } };
    setPlexGroups(nextGroups);
    if (settingsRef.current) void recomputeAllOutputPaths(settingsRef.current, nextGroups);
  }

  function onChangePlexEnabled(itemId: string, enabled: boolean): void {
    updateGroupForItem(itemId, { enabled });
  }

  function onChangeShowName(itemId: string, showName: string): void {
    updateGroupForItem(itemId, { showName });
  }

  function onChangeSeason(itemId: string, season: number): void {
    updateGroupForItem(itemId, { season: normalizePositiveInteger(season) });
  }

  function onChangeStartEpisode(itemId: string, startEpisode: number): void {
    updateGroupForItem(itemId, { startEpisode: normalizePositiveInteger(startEpisode) });
  }

  function onChangeItemKind(itemId: string, kind: PlexKind): void {
    const nextItems = itemsRef.current.map((it) => (it.id === itemId ? { ...it, plexKind: kind } : it));
    setItems(nextItems);
    if (settingsRef.current) void recomputeAllOutputPaths(settingsRef.current, plexGroupsRef.current, nextItems);
  }

  function onChangeFilenameOverride(itemId: string, filenameOverride: string | undefined): void {
    const nextItems = itemsRef.current.map((it) => (it.id === itemId ? { ...it, plexFilenameOverride: filenameOverride } : it));
    setItems(nextItems);
    if (settingsRef.current) void recomputeAllOutputPaths(settingsRef.current, plexGroupsRef.current, nextItems);
  }

  async function onStartQueue(): Promise<void> {
    // Synchronous re-entrancy guard: the checks below are async (IPC round
    // trips), so a double-click before the "encoding" status event lands
    // could otherwise slip through twice and start two ffmpeg processes.
    if (startingRef.current) return;
    startingRef.current = true;
    setIsStarting(true);

    try {
      const currentSettings = settingsRef.current;
      // Without an output directory nothing can resolve to a real path, and
      // requiring one up front means resolveOutputPath below is guaranteed
      // to return a defined outputPath for every candidate.
      if (!currentSettings?.lastOutputDirectory) return;

      // Candidate selection doesn't gate on the item's currently-stored
      // status: a rapid edit could have raced a recompute and left a stale
      // "conflict" on an item that's actually fine, and status-gating here
      // would silently drop it from the queue instead of giving it a chance
      // to revalidate as ready. startQueueCandidates only requires a
      // successful probe, not being in-progress/done, and a resolved video
      // track; revalidation below determines the real ready/conflict status.
      const candidates = startQueueCandidates(itemsRef.current);
      if (candidates.length === 0) return;

      // Re-check destinations immediately before encoding: a file may have
      // appeared on disk, or the queue may now contain two items resolving to
      // the same path, since these were last probed. Recompute Plex paths
      // over every numbering-eligible item (not just candidates) so grouped
      // episode numbering stays consistent with what's shown in the UI.
      const plexPaths = computeGroupPlexPaths(itemsRef.current, plexGroupsRef.current);
      const revalidated = await Promise.all(
        candidates.map(async (item) => ({
          item,
          outcome: await resolveOutputPath(item, currentSettings, plexPaths.get(item.id)),
        })),
      );

      // Probe the actual destination volume rather than guessing case
      // sensitivity from the OS, which is wrong for case-sensitive macOS
      // volumes, Linux mounts of case-insensitive filesystems, and network shares.
      const caseSensitive = currentSettings.lastOutputDirectory
        ? await window.desktop.isCaseSensitiveDirectory(currentSettings.lastOutputDirectory)
        : false;

      const duplicateIds = findDuplicateOutputPaths(
        revalidated
          .filter(({ outcome }) => outcome.status === "ready")
          .map(({ item, outcome }) => ({ id: item.id, outputPath: outcome.outputPath! })),
        { caseSensitive },
      );

      const queueItems: QueueEncodeItem[] = [];
      for (const { item, outcome } of revalidated) {
        if (outcome.status === "conflict" || duplicateIds.has(item.id)) {
          updateItem(item.id, { status: "conflict", outputPath: outcome.outputPath });
          continue;
        }
        updateItem(item.id, { status: "ready", outputPath: outcome.outputPath });
        queueItems.push({
          id: item.id,
          inputPath: item.inputPath,
          outputPath: outcome.outputPath!,
          presetId: item.presetId,
          videoTrackIndex: item.videoTrackIndex!,
          audioTrackIndex: item.audioTrackIndex,
          subtitle: item.subtitle,
          subtitleTracks: item.media?.subtitleTracks.map((t) => ({ index: t.index, codec: t.codec })) ?? [],
          durationSeconds: item.media?.durationSeconds,
        });
      }

      if (queueItems.length === 0) return;

      await window.desktop.startEncode(queueItems);
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  }

  async function onCancelCurrent(): Promise<void> {
    const current = itemsRef.current.find((it) => it.status === "encoding");
    if (!current) return;
    await window.desktop.cancelEncode(current.id);
  }

  const isEncoding = items.some((it) => it.status === "encoding");
  const canStartQueue = items.some((it) => it.status === "ready" && it.outputPath !== undefined);
  const selectedItems = items.filter((it) => selectedIds.includes(it.id));
  const selectedItem = selectedItems.length === 1 ? selectedItems[0] : undefined;

  return {
    items,
    selectedItem,
    selectedItems,
    selectedIds,
    settings,
    toolsStatus,
    showSettings,
    logs,
    isEncoding,
    isStarting,
    canStartQueue,
    setShowSettings,
    onAddFiles,
    onAddFolder,
    onChooseOutputFolder,
    onUpdateSettings,
    onBrowseExecutable,
    onSelect,
    onChangePreset,
    onChangeAudioTrack,
    onChangeSubtitleMode,
    onToggleSubtitleTrack,
    onChangePlexEnabled,
    onChangeShowName,
    onChangeSeason,
    onChangeStartEpisode,
    onChangeItemKind,
    onChangeFilenameOverride,
    onBulkChangeKind,
    onBulkChangeSeason,
    getPlexInfoForItem,
    onStartQueue,
    onCancelCurrent,
  };
}
