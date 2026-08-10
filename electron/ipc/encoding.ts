import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { buildFfmpegArgs } from "../../src/media/ffmpegCommand";
import { PRESETS } from "../../src/media/presets";
import { computeEncodeProgress, createProgressParser } from "../../src/media/progress";
import { IPC_CHANNELS, type QueueEncodeItem } from "../../src/ipc/api";

interface RunningEncode {
  id: string;
  child: ChildProcess;
  cancelled: boolean;
}

let running: RunningEncode | undefined;
let queueActive = false;
let queueCancelled = false;

function emitLog(window: BrowserWindow, level: "info" | "error", message: string): void {
  window.webContents.send(IPC_CHANNELS.log, { timestamp: Date.now(), level, message });
}

/**
 * Runs queue items sequentially, sending progress/status/log events to the
 * renderer as it goes. Rejects a second, concurrent call while one queue is
 * already running — the renderer guards against this too, but the main
 * process is the last line of defense against launching parallel ffmpeg
 * processes (which would also corrupt the single `running` cancellation slot).
 */
export async function startEncodeQueue(
  window: BrowserWindow,
  ffmpegPath: string,
  items: QueueEncodeItem[],
): Promise<void> {
  if (queueActive) {
    for (const item of items) {
      window.webContents.send(IPC_CHANNELS.encodeStatus, {
        id: item.id,
        status: "error",
        error: "An encode queue is already running.",
      });
    }
    return;
  }

  queueActive = true;
  queueCancelled = false;
  try {
    for (const item of items) {
      if (queueCancelled) {
        window.webContents.send(IPC_CHANNELS.encodeStatus, { id: item.id, status: "cancelled" });
        continue;
      }
      await runOne(window, ffmpegPath, item);
    }
  } finally {
    queueActive = false;
  }
}

async function runOne(window: BrowserWindow, ffmpegPath: string, item: QueueEncodeItem): Promise<void> {
  const preset = PRESETS[item.presetId];

  let args: string[];
  try {
    args = [
      "-progress",
      "pipe:1",
      "-nostats",
      ...buildFfmpegArgs({
        inputPath: item.inputPath,
        outputPath: item.outputPath,
        preset,
        videoTrackIndex: item.videoTrackIndex,
        audioTrackIndex: item.audioTrackIndex,
        subtitle: item.subtitle,
        subtitleTracks: item.subtitleTracks,
      }),
    ];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitLog(window, "error", message);
    window.webContents.send(IPC_CHANNELS.encodeStatus, { id: item.id, status: "error", error: message });
    return;
  }

  try {
    await fs.mkdir(path.dirname(item.outputPath), { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitLog(window, "error", `Failed to create output directory: ${message}`);
    window.webContents.send(IPC_CHANNELS.encodeStatus, { id: item.id, status: "error", error: message });
    return;
  }

  emitLog(window, "info", `ffmpeg ${args.join(" ")}`);
  window.webContents.send(IPC_CHANNELS.encodeStatus, { id: item.id, status: "encoding" });

  const child = spawn(ffmpegPath, args, { windowsHide: true });
  running = { id: item.id, child, cancelled: false };

  const parser = createProgressParser();
  const startedAt = Date.now();
  let stderr = "";

  child.stdout?.on("data", (chunk: Buffer) => {
    const events = parser.feed(chunk.toString());
    for (const event of events) {
      const progress = computeEncodeProgress(event, item.durationSeconds, (Date.now() - startedAt) / 1000);
      window.webContents.send(IPC_CHANNELS.encodeProgress, {
        id: item.id,
        percent: progress.percent,
        elapsedSeconds: progress.elapsedSeconds,
        speed: progress.speed,
        etaSeconds: progress.etaSeconds,
      });
    }
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on("close", (code) => resolve(code));
    child.on("error", (error) => {
      emitLog(window, "error", `ffmpeg failed to start: ${error.message}`);
      resolve(null);
    });
  });

  const wasCancelled = running?.id === item.id ? running.cancelled : false;
  running = undefined;

  if (stderr.trim().length > 0) {
    emitLog(window, exitCode === 0 ? "info" : "error", stderr.trim());
  }

  if (wasCancelled) {
    window.webContents.send(IPC_CHANNELS.encodeStatus, { id: item.id, status: "cancelled" });
  } else if (exitCode === 0) {
    window.webContents.send(IPC_CHANNELS.encodeStatus, { id: item.id, status: "complete" });
  } else {
    window.webContents.send(IPC_CHANNELS.encodeStatus, {
      id: item.id,
      status: "error",
      error: `ffmpeg exited with code ${exitCode}`,
    });
  }
}

/**
 * Cancels the active queue: kills whichever ffmpeg process is currently
 * running (if any) and stops the queue from advancing to subsequent items.
 *
 * Ignores the passed id rather than requiring an exact match against
 * `running.id`: the renderer only ever has one "current" item to cancel, but
 * it derives that id from state that updates asynchronously, so right after
 * one item finishes and the next starts, the renderer can briefly still be
 * showing the previous item as encoding. Gating on queueActive instead means
 * a cancel request in that window still cancels the queue instead of being a
 * silent no-op. No-op if no queue is active.
 */
export function cancelCurrentEncode(_id: string): void {
  if (!queueActive) return;
  queueCancelled = true;
  if (running) {
    running.cancelled = true;
    running.child.kill();
  }
}
