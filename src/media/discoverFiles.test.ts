import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverMkvFiles } from "./discoverFiles";

describe("discoverMkvFiles", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "anime-plex-converter-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("finds .mkv files in nested folders", async () => {
    await fs.mkdir(path.join(tempDir, "Cowboy Bebop", "Disc 1"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "Cowboy Bebop", "Disc 1", "Episode 01.mkv"), "");
    await fs.writeFile(path.join(tempDir, "Cowboy Bebop", "Disc 1", "Episode 02.mkv"), "");

    const files = await discoverMkvFiles(tempDir);

    expect(files).toHaveLength(2);
    expect(files[0]).toContain("Episode 01.mkv");
  });

  it("ignores non-mkv files", async () => {
    await fs.writeFile(path.join(tempDir, "notes.txt"), "");
    await fs.writeFile(path.join(tempDir, "poster.jpg"), "");
    await fs.writeFile(path.join(tempDir, "Episode 01.mkv"), "");

    const files = await discoverMkvFiles(tempDir);

    expect(files).toHaveLength(1);
    expect(files[0]).toContain("Episode 01.mkv");
  });

  it("returns an empty array for a directory with no mkv files", async () => {
    const files = await discoverMkvFiles(tempDir);
    expect(files).toEqual([]);
  });

  it("handles multiple sibling shows and multiple discs", async () => {
    await fs.mkdir(path.join(tempDir, "Show A", "Disc 1"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "Show B"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "Show A", "Disc 1", "Ep01.mkv"), "");
    await fs.writeFile(path.join(tempDir, "Show B", "Ep01.mkv"), "");

    const files = await discoverMkvFiles(tempDir);
    expect(files).toHaveLength(2);
  });

  it("is case-insensitive for the .mkv extension", async () => {
    await fs.writeFile(path.join(tempDir, "Episode 01.MKV"), "");
    const files = await discoverMkvFiles(tempDir);
    expect(files).toHaveLength(1);
  });
});
