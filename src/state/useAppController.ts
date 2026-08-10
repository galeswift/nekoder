import { useEffect, useRef, useState } from "react";
import type { PresetId } from "../media/presets";
import type { SubtitleMode } from "../media/ffmpegCommand";
import type { AppSettings } from "../settings/types";
import type { DiscoveredFile, FfmpegToolsStatus, LogEvent, QueueEncodeItem } from "../ipc/api";
import { createQueueItem, deriveTrackSelection, type QueueItem, type QueueItemStatus } from "./queueItem";
import { findDuplicateOutputPaths, isLikelyCaseSensitiveFilesystem } from "./conflictDetection";
import { selectBurnTrackIndexOnModeChange } from "./burnTrackSelection";

function isInProgressOrDone(item: QueueItem): boolean {
  return item.status === "encoding" || item.status === "complete";
}

export function useAppController() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [settings, setSettings] = useState<AppSettings | undefined>(undefined);
  const [toolsStatus, setToolsStatus] = useState<FfmpegToolsStatus | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [isStarting, setIsStarting] = useState(false);

  const settingsRef = useRef<AppSettings | undefined>(undefined);
  const itemsRef = useRef<QueueItem[]>([]);
  const startingRef = useRef(false);
  settingsRef.current = settings;
  itemsRef.current = items;

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
  ): Promise<{ outputPath: string | undefined; status: QueueItemStatus }> {
    if (!currentSettings.lastOutputDirectory) {
      return { outputPath: undefined, status: "ready" };
    }
    const { outputPath, exists } = await window.desktop.resolveOutputPath({
      sourceRoot: item.sourceRoot,
      filePath: item.inputPath,
      outputRoot: currentSettings.lastOutputDirectory,
      preserveStructure: currentSettings.preserveDirectoryStructure,
    });
    return { outputPath, status: exists ? "conflict" : "ready" };
  }

  async function probeItem(item: QueueItem, currentSettings: AppSettings): Promise<void> {
    updateItem(item.id, { status: "probing" });
    const response = await window.desktop.probeMedia(item.inputPath);

    if (!response.ok) {
      updateItem(item.id, { status: "error", errorMessage: response.error });
      return;
    }

    const derived = deriveTrackSelection(response.media, {
      audioLanguage: currentSettings.preferredAudioLanguage,
      subtitleLanguage: currentSettings.preferredSubtitleLanguage,
    });
    const outcome = await resolveOutputPath(item, currentSettings);

    updateItem(item.id, {
      media: response.media,
      ...derived,
      outputPath: outcome.outputPath,
      status: outcome.status,
    });
  }

  async function addDiscoveredFiles(discovered: DiscoveredFile[]): Promise<void> {
    const currentSettings = settingsRef.current;
    if (discovered.length === 0 || !currentSettings) return;

    const newItems = discovered.map((file) => createQueueItem(file, currentSettings.lastPresetId));
    setItems((prev) => [...prev, ...newItems]);

    for (const item of newItems) {
      await probeItem(item, currentSettings);
    }
  }

  async function recomputeOutputPaths(currentSettings: AppSettings): Promise<void> {
    for (const item of itemsRef.current) {
      if (!item.media || isInProgressOrDone(item)) continue;
      const outcome = await resolveOutputPath(item, currentSettings);
      updateItem(item.id, { outputPath: outcome.outputPath, status: outcome.status });
    }
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
    await recomputeOutputPaths(updated);
  }

  async function onUpdateSettings(partial: Partial<AppSettings>): Promise<void> {
    const updated = await window.desktop.updateSettings(partial);
    setSettings(updated);
    if (partial.preserveDirectoryStructure !== undefined) {
      await recomputeOutputPaths(updated);
    }
  }

  async function onBrowseExecutable(kind: "ffmpeg" | "ffprobe"): Promise<void> {
    const chosenPath = await window.desktop.browseForExecutable(kind);
    if (!chosenPath) return;
    await onUpdateSettings(kind === "ffmpeg" ? { ffmpegPath: chosenPath } : { ffprobePath: chosenPath });
    const tools = await window.desktop.checkFfmpegTools();
    setToolsStatus(tools);
  }

  function onSelect(id: string): void {
    setSelectedId(id);
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
        if (mode === "copy") {
          const trackIndexes = it.subtitle.mode === "copy" ? it.subtitle.trackIndexes : [];
          return { ...it, subtitle: { mode: "copy", trackIndexes }, subtitleReason: "Manually selected." };
        }
        const burnTrackIndex = selectBurnTrackIndexOnModeChange(it.subtitle, it.media?.subtitleTracks ?? []);
        return {
          ...it,
          subtitle: { mode: "burn", trackIndexes: [], burnTrackIndex },
          subtitleReason: "Manually selected.",
        };
      }),
    );
  }

  function onToggleSubtitleTrack(itemId: string, index: number): void {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId || it.subtitle.mode !== "copy") return it;
        const has = it.subtitle.trackIndexes.includes(index);
        const trackIndexes = has
          ? it.subtitle.trackIndexes.filter((i) => i !== index)
          : [...it.subtitle.trackIndexes, index];
        return { ...it, subtitle: { mode: "copy", trackIndexes }, subtitleReason: "Manually selected." };
      }),
    );
  }

  function onChangeBurnTrack(itemId: string, index: number): void {
    updateItem(itemId, { subtitle: { mode: "burn", trackIndexes: [], burnTrackIndex: index } });
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
      const candidates = itemsRef.current.filter(
        (it) => it.status === "ready" && it.outputPath !== undefined && it.videoTrackIndex !== undefined,
      );
      if (candidates.length === 0 || !currentSettings) return;

      // Re-check destinations immediately before encoding: a file may have
      // appeared on disk, or the queue may now contain two items resolving to
      // the same path, since these were last probed.
      const revalidated = await Promise.all(
        candidates.map(async (item) => ({ item, outcome: await resolveOutputPath(item, currentSettings) })),
      );

      const duplicateIds = findDuplicateOutputPaths(
        revalidated
          .filter(({ outcome }) => outcome.status === "ready")
          .map(({ item, outcome }) => ({ id: item.id, outputPath: outcome.outputPath! })),
        { caseSensitive: isLikelyCaseSensitiveFilesystem() },
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
  const selectedItem = items.find((it) => it.id === selectedId);

  return {
    items,
    selectedItem,
    selectedId,
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
    onChangeBurnTrack,
    onStartQueue,
    onCancelCurrent,
  };
}
