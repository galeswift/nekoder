import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { DEFAULT_SETTINGS, parseSettings, serializeSettings, type AppSettings } from "../../src/settings/types";

function settingsFilePath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsFilePath(), "utf-8");
    return parseSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const filePath = settingsFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, serializeSettings(settings), "utf-8");
}
