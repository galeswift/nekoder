import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeOutputPath, hasOutputConflict, isMkvFile } from "./outputPaths";

describe("isMkvFile", () => {
  it("accepts .mkv regardless of case", () => {
    expect(isMkvFile("Episode 01.mkv")).toBe(true);
    expect(isMkvFile("Episode 01.MKV")).toBe(true);
  });

  it("rejects other extensions", () => {
    expect(isMkvFile("Episode 01.mp4")).toBe(false);
    expect(isMkvFile("notes.txt")).toBe(false);
  });
});

describe("computeOutputPath", () => {
  it("preserves nested relative directory structure", () => {
    const sourceRoot = path.join("Anime");
    const filePath = path.join("Anime", "Cowboy Bebop", "Disc 1", "Episode 01.mkv");
    const outputRoot = path.join("Converted");

    const result = computeOutputPath({ sourceRoot, filePath, outputRoot, preserveStructure: true });

    expect(result).toBe(path.join("Converted", "Cowboy Bebop", "Disc 1", "Episode 01.mkv"));
  });

  it("flattens output when preserveStructure is false", () => {
    const sourceRoot = path.join("Anime");
    const filePath = path.join("Anime", "Cowboy Bebop", "Disc 1", "Episode 01.mkv");
    const outputRoot = path.join("Converted");

    const result = computeOutputPath({ sourceRoot, filePath, outputRoot, preserveStructure: false });

    expect(result).toBe(path.join("Converted", "Episode 01.mkv"));
  });

  it("normalizes the output extension to .mkv", () => {
    const result = computeOutputPath({
      sourceRoot: "Anime",
      filePath: path.join("Anime", "Episode 01.MKV"),
      outputRoot: "Converted",
      preserveStructure: true,
    });

    expect(result.endsWith(".mkv")).toBe(true);
  });

  it("falls back to a flat path when the file is outside sourceRoot", () => {
    const result = computeOutputPath({
      sourceRoot: path.join("Anime", "Show A"),
      filePath: path.join("Anime", "Show B", "Episode 01.mkv"),
      outputRoot: "Converted",
      preserveStructure: true,
    });

    expect(result).toBe(path.join("Converted", "Episode 01.mkv"));
  });

  it("handles a single-file import where sourceRoot equals the file's own directory", () => {
    const filePath = path.join("D:", "rips", "Episode 01.mkv");
    const result = computeOutputPath({
      sourceRoot: path.join("D:", "rips"),
      filePath,
      outputRoot: path.join("D:", "out"),
      preserveStructure: true,
    });

    expect(result).toBe(path.join("D:", "out", "Episode 01.mkv"));
  });

  it("handles paths containing spaces and special characters", () => {
    const result = computeOutputPath({
      sourceRoot: path.join("Anime"),
      filePath: path.join("Anime", "Fullmetal Alchemist - Brotherhood!", "Ep 01 (v2).mkv"),
      outputRoot: "Converted",
      preserveStructure: true,
    });

    expect(result).toBe(
      path.join("Converted", "Fullmetal Alchemist - Brotherhood!", "Ep 01 (v2).mkv"),
    );
  });
});

describe("hasOutputConflict", () => {
  it("returns true when the destination already exists", async () => {
    const result = await hasOutputConflict("out/ep01.mkv", () => true);
    expect(result).toBe(true);
  });

  it("returns false when the destination does not exist", async () => {
    const result = await hasOutputConflict("out/ep01.mkv", () => false);
    expect(result).toBe(false);
  });

  it("supports an async exists check", async () => {
    const result = await hasOutputConflict("out/ep01.mkv", async () => true);
    expect(result).toBe(true);
  });
});
