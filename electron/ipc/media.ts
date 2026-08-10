import { dialog, type BrowserWindow } from "electron";
import { normalizeMediaFile, type RawFfprobeOutput } from "../../src/media/ffprobe";
import { locateTool } from "../../src/media/toolLocator";
import type { ProcessRunner } from "../../src/media/processRunner";
import type { FfmpegToolsStatus, ProbeMediaResponse } from "../../src/ipc/api";
import type { AppSettings } from "../../src/settings/types";

export async function probeMediaFile(
  runner: ProcessRunner,
  ffprobePath: string,
  filePath: string,
): Promise<ProbeMediaResponse> {
  try {
    const result = await runner.run(ffprobePath, [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);

    if (result.exitCode !== 0) {
      return {
        ok: false,
        error: `ffprobe exited with code ${result.exitCode}: ${result.stderr.slice(0, 500)}`,
      };
    }

    const parsed = JSON.parse(result.stdout) as RawFfprobeOutput;
    return { ok: true, media: normalizeMediaFile(filePath, parsed) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function checkFfmpegTools(
  runner: ProcessRunner,
  settings: AppSettings,
): Promise<FfmpegToolsStatus> {
  const ffmpeg = await locateTool(runner, [settings.ffmpegPath, "ffmpeg"]);
  const ffprobe = await locateTool(runner, [settings.ffprobePath, "ffprobe"]);
  return { ffmpeg, ffprobe };
}

export async function browseForExecutable(
  window: BrowserWindow,
  kind: "ffmpeg" | "ffprobe",
): Promise<string | undefined> {
  const result = await dialog.showOpenDialog(window, {
    title: `Locate ${kind}`,
    properties: ["openFile"],
    filters: process.platform === "win32" ? [{ name: "Executable", extensions: ["exe"] }] : undefined,
  });
  if (result.canceled || result.filePaths.length === 0) return undefined;
  return result.filePaths[0];
}
