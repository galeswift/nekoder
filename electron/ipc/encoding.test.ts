import { EventEmitter } from "node:events";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { IPC_CHANNELS, type QueueEncodeItem } from "../../src/ipc/api";

const mkdirMock = vi.fn().mockResolvedValue(undefined);
const rmMock = vi.fn().mockResolvedValue(undefined);
const linkMock = vi.fn().mockResolvedValue(undefined);
vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: (...args: unknown[]) => mkdirMock(...args),
    rm: (...args: unknown[]) => rmMock(...args),
    link: (...args: unknown[]) => linkMock(...args),
  },
}));

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const { startEncodeQueue, cancelCurrentEncode } = await import("./encoding");

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

/** Mirrors the item-id-scoped naming in encoding.ts's partialOutputPath. */
function partialPathFor(item: QueueEncodeItem): string {
  return path.join(path.dirname(item.outputPath), `Episode.${item.id}.partial.mkv`);
}

describe("startEncodeQueue", () => {
  beforeEach(() => {
    mkdirMock.mockClear();
    mkdirMock.mockResolvedValue(undefined);
    rmMock.mockClear();
    rmMock.mockResolvedValue(undefined);
    linkMock.mockClear();
    linkMock.mockResolvedValue(undefined);
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

  it("rejects a second concurrent call instead of running parallel ffmpeg processes", async () => {
    const firstChild = fakeChild();
    spawnMock.mockImplementationOnce(() => firstChild);

    const window = fakeWindow();
    const firstQueue = startEncodeQueue(window, "ffmpeg", [baseItem({ id: "1" })]);

    // Let the first item's mkdir/spawn happen before the second call arrives.
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));

    const secondQueue = startEncodeQueue(window, "ffmpeg", [baseItem({ id: "2" })]);
    await secondQueue;

    expect(spawnMock).toHaveBeenCalledTimes(1); // second call never spawned ffmpeg
    expect(window.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.encodeStatus,
      expect.objectContaining({ id: "2", status: "error", error: expect.stringContaining("already running") }),
    );

    firstChild.emit("close", 0);
    await firstQueue;
  });

  it("cancels the running process even when the passed id doesn't match it", async () => {
    // Simulates the renderer's stale-id transition window: it still sends
    // the id of the item it last knew was "encoding", which may not be the
    // one actually running by the time the request arrives.
    const firstChild = fakeChild();
    spawnMock.mockImplementationOnce(() => firstChild);

    const window = fakeWindow();
    const item1 = baseItem({ id: "1" });
    const item2 = baseItem({ id: "2" });
    const queue = startEncodeQueue(window, "ffmpeg", [item1, item2]);

    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));

    cancelCurrentEncode("some-stale-or-mismatched-id");
    expect(firstChild.kill).toHaveBeenCalled();
    firstChild.emit("close", null);

    await queue;

    expect(spawnMock).toHaveBeenCalledTimes(1); // second item never spawned
  });

  it("encodes to an id-scoped sibling .partial file and links+removes it to finalize the real output", async () => {
    const child = fakeChild();
    const item = baseItem();
    const partialPath = partialPathFor(item);
    spawnMock.mockImplementation((_ffmpeg, args: string[]) => {
      // The output path is the last ffmpeg argument.
      expect(args.at(-1)).toBe(partialPath);
      queueMicrotask(() => child.emit("close", 0));
      return child;
    });

    await startEncodeQueue(fakeWindow(), "ffmpeg", [item]);

    expect(linkMock).toHaveBeenCalledWith(partialPath, item.outputPath);
    expect(rmMock).toHaveBeenCalledWith(partialPath, { force: true });
  });

  it("scopes the partial filename to the item id so two queued items never collide, and a fixed name can't shadow an unrelated user file", async () => {
    const child1 = fakeChild();
    const child2 = fakeChild();
    const item1 = baseItem({ id: "aaa" });
    const item2 = baseItem({ id: "bbb" });
    const seenOutputPaths: string[] = [];
    spawnMock.mockImplementationOnce((_ffmpeg, args: string[]) => {
      seenOutputPaths.push(args.at(-1)!);
      queueMicrotask(() => child1.emit("close", 0));
      return child1;
    });
    spawnMock.mockImplementationOnce((_ffmpeg, args: string[]) => {
      seenOutputPaths.push(args.at(-1)!);
      queueMicrotask(() => child2.emit("close", 0));
      return child2;
    });

    await startEncodeQueue(fakeWindow(), "ffmpeg", [item1, item2]);

    expect(seenOutputPaths).toEqual([partialPathFor(item1), partialPathFor(item2)]);
    expect(new Set(seenOutputPaths).size).toBe(2);
  });

  it("does not overwrite an existing destination file: reports an error and cleans up the temp file when link fails (e.g. EEXIST)", async () => {
    const child = fakeChild();
    const item = baseItem();
    const partialPath = partialPathFor(item);
    spawnMock.mockImplementation(() => {
      queueMicrotask(() => child.emit("close", 0));
      return child;
    });
    const linkError = Object.assign(new Error("EEXIST: file already exists"), { code: "EEXIST" });
    linkMock.mockRejectedValueOnce(linkError);

    const window = fakeWindow();
    await startEncodeQueue(window, "ffmpeg", [item]);

    expect(linkMock).toHaveBeenCalledWith(partialPath, item.outputPath);
    expect(rmMock).toHaveBeenCalledWith(partialPath, { force: true });
    expect(window.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.encodeStatus,
      expect.objectContaining({ id: "1", status: "error" }),
    );
    // Critically, a failed finalize must never be reported as "complete".
    expect(window.webContents.send).not.toHaveBeenCalledWith(
      IPC_CHANNELS.encodeStatus,
      expect.objectContaining({ id: "1", status: "complete" }),
    );
  });

  it("removes the partial file instead of linking it when ffmpeg fails", async () => {
    const child = fakeChild();
    spawnMock.mockImplementation(() => {
      queueMicrotask(() => child.emit("close", 1));
      return child;
    });

    const window = fakeWindow();
    const item = baseItem();
    const partialPath = partialPathFor(item);
    await startEncodeQueue(window, "ffmpeg", [item]);

    expect(linkMock).not.toHaveBeenCalled();
    expect(rmMock).toHaveBeenCalledWith(partialPath, { force: true });
    expect(window.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.encodeStatus,
      expect.objectContaining({ id: "1", status: "error" }),
    );
  });

  it("removes the partial file instead of linking it when the encode is cancelled", async () => {
    const child = fakeChild();
    spawnMock.mockImplementationOnce(() => child);

    const window = fakeWindow();
    const item = baseItem();
    const partialPath = partialPathFor(item);
    const queue = startEncodeQueue(window, "ffmpeg", [item]);

    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    cancelCurrentEncode("1");
    child.emit("close", null);
    await queue;

    expect(linkMock).not.toHaveBeenCalled();
    expect(rmMock).toHaveBeenCalledWith(partialPath, { force: true });
  });

  it("does nothing when no queue is active", () => {
    expect(() => cancelCurrentEncode("1")).not.toThrow();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("cancelling the current encode stops the queue instead of starting the next item", async () => {
    const firstChild = fakeChild();
    spawnMock.mockImplementationOnce(() => firstChild);

    const window = fakeWindow();
    const item1 = baseItem({ id: "1" });
    const item2 = baseItem({ id: "2" });
    const queue = startEncodeQueue(window, "ffmpeg", [item1, item2]);

    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));

    cancelCurrentEncode("1");
    expect(firstChild.kill).toHaveBeenCalled();
    firstChild.emit("close", null);

    await queue;

    expect(spawnMock).toHaveBeenCalledTimes(1); // second item never spawned
    expect(window.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.encodeStatus,
      expect.objectContaining({ id: "1", status: "cancelled" }),
    );
    expect(window.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.encodeStatus,
      expect.objectContaining({ id: "2", status: "cancelled" }),
    );
  });
});
