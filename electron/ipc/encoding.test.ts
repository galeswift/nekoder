import { EventEmitter } from "node:events";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { IPC_CHANNELS, type QueueEncodeItem } from "../../src/ipc/api";

const mkdirMock = vi.fn().mockResolvedValue(undefined);
vi.mock("node:fs/promises", () => ({
  default: { mkdir: (...args: unknown[]) => mkdirMock(...args) },
}));

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const { startEncodeQueue } = await import("./encoding");

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

function fakeWindow(): BrowserWindow {
  return { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
}

function baseItem(overrides: Partial<QueueEncodeItem> = {}): QueueEncodeItem {
  return {
    id: "1",
    inputPath: "C:/rips/Show/Disc 1/Episode.mkv",
    outputPath: "C:/out/Show/Disc 1/Episode.mkv",
    presetId: "remux",
    videoTrackIndex: 0,
    audioTrackIndex: undefined,
    subtitle: { mode: "none", trackIndexes: [] },
    subtitleTracks: [],
    durationSeconds: undefined,
    ...overrides,
  };
}

describe("startEncodeQueue", () => {
  beforeEach(() => {
    mkdirMock.mockClear();
    mkdirMock.mockResolvedValue(undefined);
    spawnMock.mockReset();
  });

  it("creates the output directory (recursively) before spawning ffmpeg", async () => {
    const child = fakeChild();
    spawnMock.mockImplementation(() => {
      queueMicrotask(() => child.emit("close", 0));
      return child;
    });

    const item = baseItem();
    await startEncodeQueue(fakeWindow(), "ffmpeg", [item]);

    expect(mkdirMock).toHaveBeenCalledWith(path.dirname(item.outputPath), { recursive: true });
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const mkdirOrder = mkdirMock.mock.invocationCallOrder[0]!;
    const spawnOrder = spawnMock.mock.invocationCallOrder[0]!;
    expect(mkdirOrder).toBeLessThan(spawnOrder);
  });

  it("reports an error and never spawns ffmpeg when the directory can't be created", async () => {
    mkdirMock.mockRejectedValueOnce(new Error("EACCES: permission denied"));
    const window = fakeWindow();

    await startEncodeQueue(window, "ffmpeg", [baseItem()]);

    expect(spawnMock).not.toHaveBeenCalled();
    expect(window.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.encodeStatus,
      expect.objectContaining({ id: "1", status: "error" }),
    );
  });
});
