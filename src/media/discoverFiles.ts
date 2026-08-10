import fs from "node:fs/promises";
import path from "node:path";
import { isMkvFile } from "./outputPaths";

/**
 * Recursively finds all .mkv files under rootDir. Uses Node's built-in
 * fs/promises rather than a traversal package; the directory tree in real
 * anime rips is shallow enough that a straightforward recursive walk is
 * both simple and fast.
 */
export async function discoverMkvFiles(rootDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && isMkvFile(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return results.sort();
}
