import fs from "node:fs/promises";
import path from "node:path";
import { dialog, type BrowserWindow } from "electron";
import { discoverMkvFiles } from "../../src/media/discoverFiles";
import { computeOutputPath, isMkvFile } from "../../src/media/outputPaths";
import type { DiscoveredFile, ResolveOutputPathRequest, ResolveOutputPathResponse } from "../../src/ipc/api";

export async function openFilesDialog(window: BrowserWindow): Promise<DiscoveredFile[]> {
  const result = await dialog.showOpenDialog(window, {
    title: "Add MKV Files",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Matroska Video", extensions: ["mkv"] }],
  });
  if (result.canceled) return [];

  return result.filePaths
    .filter((filePath) => isMkvFile(filePath))
    .map((filePath) => ({ path: filePath, sourceRoot: path.dirname(filePath) }));
}

export async function openFolderDialog(window: BrowserWindow): Promise<DiscoveredFile[]> {
  const result = await dialog.showOpenDialog(window, {
    title: "Add Folder",
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return [];

  const folder = result.filePaths[0]!;
  const files = await discoverMkvFiles(folder);
  return files.map((filePath) => ({ path: filePath, sourceRoot: folder }));
}

export async function chooseOutputFolderDialog(window: BrowserWindow): Promise<string | undefined> {
  const result = await dialog.showOpenDialog(window, {
    title: "Choose Output Folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return undefined;
  return result.filePaths[0];
}

export async function outputPathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveOutputPath(
  request: ResolveOutputPathRequest,
): Promise<ResolveOutputPathResponse> {
  const outputPath = computeOutputPath(request);
  const exists = await outputPathExists(outputPath);
  return { outputPath, exists };
}
