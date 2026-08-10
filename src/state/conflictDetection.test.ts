import { describe, expect, it } from "vitest";
import { findDuplicateOutputPaths } from "./conflictDetection";

describe("findDuplicateOutputPaths", () => {
  it("returns an empty set when all output paths are unique", () => {
    const result = findDuplicateOutputPaths([
      { id: "a", outputPath: "C:/out/One.mkv" },
      { id: "b", outputPath: "C:/out/Two.mkv" },
    ]);
    expect(result.size).toBe(0);
  });

  it("flags both items when two flattened files resolve to the same destination", () => {
    const result = findDuplicateOutputPaths([
      { id: "a", outputPath: "C:/out/Episode.mkv" },
      { id: "b", outputPath: "C:/out/Episode.mkv" },
    ]);
    expect(result).toEqual(new Set(["a", "b"]));
  });

  it("compares paths case-insensitively", () => {
    const result = findDuplicateOutputPaths([
      { id: "a", outputPath: "C:/out/Episode.mkv" },
      { id: "b", outputPath: "c:/out/episode.mkv" },
    ]);
    expect(result).toEqual(new Set(["a", "b"]));
  });

  it("flags every id sharing a three-way collision", () => {
    const result = findDuplicateOutputPaths([
      { id: "a", outputPath: "C:/out/Episode.mkv" },
      { id: "b", outputPath: "C:/out/Episode.mkv" },
      { id: "c", outputPath: "C:/out/Episode.mkv" },
    ]);
    expect(result).toEqual(new Set(["a", "b", "c"]));
  });

  it("treats same-name-different-case paths as distinct when caseSensitive is true", () => {
    const result = findDuplicateOutputPaths(
      [
        { id: "a", outputPath: "/out/Episode.mkv" },
        { id: "b", outputPath: "/out/episode.mkv" },
      ],
      { caseSensitive: true },
    );
    expect(result.size).toBe(0);
  });

  it("still flags exact-case duplicates when caseSensitive is true", () => {
    const result = findDuplicateOutputPaths(
      [
        { id: "a", outputPath: "/out/Episode.mkv" },
        { id: "b", outputPath: "/out/Episode.mkv" },
      ],
      { caseSensitive: true },
    );
    expect(result).toEqual(new Set(["a", "b"]));
  });
});
