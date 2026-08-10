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

function emitLog(window: BrowserWindow, level: "info" | "error", message: string): void {
  window.webContents.send(IPC_CHANNELS.log, { timestamp: Date.now(), level, message });
}

/** Runs queue items sequentially, sending progress/status/log events to the renderer as it goes. */
export async function startEncodeQueue(
  window: BrowserWindow,
  ffmpegPath: string,
  items: QueueEncodeItem[],
): Promise<void> {
  for (const item of items) {
    await runOne(window, ffmpegPath, item);
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

/** Kills the currently running ffmpeg process if its id matches. No-op otherwise. */
export function cancelCurrentEncode(id: string): void {
  if (running && running.id === id) {
    running.cancelled = true;
    running.child.kill();
  }
}
