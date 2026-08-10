import { describe, expect, it } from "vitest";
import {
  computeItemPlexFilename,
  computeItemPlexRelativeDir,
  defaultGroupConfig,
  folderLabelForGroupKey,
  groupKeyForFile,
} from "./plexGroups";

describe("groupKeyForFile", () => {
  it("groups files in the same folder under the same key", () => {
    const a = groupKeyForFile("D:\\Video\\K-ONComplete18 BD-1\\title_t00.mkv");
    const b = groupKeyForFile("D:\\Video\\K-ONComplete18 BD-1\\title_t01.mkv");
    expect(a).toBe(b);
  });

  it("gives different folders different keys", () => {
    const a = groupKeyForFile("D:\\Video\\K-ONComplete18 BD-1\\title_t00.mkv");
    const b = groupKeyForFile("D:\\Video\\K-ONComplete18 BD-6\\title_t00.mkv");
    expect(a).not.toBe(b);
  });

  it("handles forward-slash paths too", () => {
    const a = groupKeyForFile("/d/Video/Robotech 1/Robotech 1-B1_t00.mkv");
    const b = groupKeyForFile("/d/Video/Robotech 1/Robotech 1-B1_t01.mkv");
    expect(a).toBe(b);
  });
});

describe("folderLabelForGroupKey", () => {
  it("returns the last path segment", () => {
    expect(folderLabelForGroupKey(groupKeyForFile("D:\\Video\\Robotech 1\\Robotech 1-B1_t00.mkv"))).toBe(
      "Robotech 1",
    );
  });
});

describe("defaultGroupConfig", () => {
  it("guesses a show name from the folder and defaults season/startEpisode to 1", () => {
    const key = groupKeyForFile("D:\\Video\\K-ONComplete18 BD-7\\title_t00.mkv");
    const config = defaultGroupConfig(key);
    expect(config).toEqual({ enabled: true, showName: "K-ON", season: 1, startEpisode: 1 });
  });
});

describe("computeItemPlexFilename", () => {
  const group = { enabled: true, showName: "K-ON", season: 1, startEpisode: 1 };

  it("builds a suggested episode filename when there is no override", () => {
    expect(computeItemPlexFilename({ kind: "episode", filenameOverride: undefined, episode: 4 }, group)).toBe(
      "K-ON - s01e04.mkv",
    );
  });

  it("uses the user-provided override instead, sanitized", () => {
    expect(
      computeItemPlexFilename({ kind: "episode", filenameOverride: "My Custom Name", episode: 4 }, group),
    ).toBe("My Custom Name.mkv");
  });

  it("ignores a blank override and falls back to the suggestion", () => {
    expect(computeItemPlexFilename({ kind: "episode", filenameOverride: "   ", episode: 4 }, group)).toBe(
      "K-ON - s01e04.mkv",
    );
  });
});

describe("computeItemPlexRelativeDir", () => {
  it("nests extras under an Extras subfolder", () => {
    const group = { enabled: true, showName: "Robotech", season: 1, startEpisode: 1 };
    expect(computeItemPlexRelativeDir("extra", group)).toEqual(["Robotech", "Extras"]);
    expect(computeItemPlexRelativeDir("episode", group)).toEqual(["Robotech"]);
  });
});
