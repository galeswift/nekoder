import { describe, expect, it } from "vitest";
import {
  assignSequenceNumbers,
  buildPlexFilename,
  buildPlexRelativeDir,
  classifyByDuration,
  guessShowName,
  normalizePositiveInteger,
  sanitizePathSegment,
} from "./plexNaming";

describe("classifyByDuration", () => {
  it("classifies a ~110 minute file as a movie", () => {
    expect(classifyByDuration(6649.643)).toBe("movie");
  });

  it("classifies a ~3 minute clip as an extra", () => {
    expect(classifyByDuration(184.192)).toBe("extra");
  });

  it("classifies a ~20-30 minute file as an episode", () => {
    expect(classifyByDuration(1358.357)).toBe("episode");
    expect(classifyByDuration(1739.744)).toBe("episode");
  });

  it("defaults to episode when duration is unknown", () => {
    expect(classifyByDuration(undefined)).toBe("episode");
  });

  it("treats the movie/extra thresholds as inclusive boundaries", () => {
    expect(classifyByDuration(3600)).toBe("movie");
    expect(classifyByDuration(300)).toBe("extra");
    expect(classifyByDuration(301)).toBe("episode");
  });
});

describe("guessShowName", () => {
  it.each([
    ["K-ON Season1+2", "K-ON"],
    ["K-ONComplete18 BD-1", "K-ON"],
    ["K-ONComplete18 BD-6", "K-ON"],
    ["K-ONComplete18 BD-7", "K-ON"],
    ["Robotech 1", "Robotech"],
    ["Robotech 2", "Robotech"],
    ["Robotech Extras 1", "Robotech"],
  ])("cleans %s -> %s", (input, expected) => {
    expect(guessShowName(input)).toBe(expected);
  });

  it("falls back to the trimmed original when everything is stripped", () => {
    expect(guessShowName("Season 1")).toBe("Season 1");
  });
});

describe("sanitizePathSegment", () => {
  it("strips characters unsafe in a path segment", () => {
    expect(sanitizePathSegment('Show: "Name" *?<>|')).toBe("Show Name");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizePathSegment("  K-ON   Movie  ")).toBe("K-ON Movie");
  });

  it("rejects traversal segments", () => {
    expect(sanitizePathSegment("..")).toBe("_");
    expect(sanitizePathSegment(".")).toBe("_");
    expect(sanitizePathSegment("")).toBe("_");
  });

  it("strips trailing dots", () => {
    expect(sanitizePathSegment("Show Name...")).toBe("Show Name");
  });
});

describe("buildPlexRelativeDir", () => {
  it("puts episodes and movies directly under the show folder", () => {
    expect(buildPlexRelativeDir({ showName: "K-ON", kind: "episode" })).toEqual(["K-ON"]);
    expect(buildPlexRelativeDir({ showName: "K-ON", kind: "movie" })).toEqual(["K-ON"]);
  });

  it("puts extras under an Extras subfolder", () => {
    expect(buildPlexRelativeDir({ showName: "Robotech", kind: "extra" })).toEqual(["Robotech", "Extras"]);
  });
});

describe("buildPlexFilename", () => {
  it("builds an episode filename", () => {
    expect(buildPlexFilename({ showName: "K-ON", kind: "episode", season: 1, episode: 3 })).toBe(
      "K-ON - s01e03.mkv",
    );
  });

  it("builds a movie filename", () => {
    expect(buildPlexFilename({ showName: "K-ON the Movie", kind: "movie" })).toBe("K-ON the Movie.mkv");
  });

  it("builds an extra filename", () => {
    expect(buildPlexFilename({ showName: "Robotech", kind: "extra", extraIndex: 2 })).toBe(
      "Robotech - extra-02.mkv",
    );
  });

  it("pads season/episode/extra numbers to two digits", () => {
    expect(buildPlexFilename({ showName: "Robotech", kind: "episode", season: 12, episode: 9 })).toBe(
      "Robotech - s12e09.mkv",
    );
  });

  it("clamps negative or fractional season/episode/extra numbers to a sane positive integer", () => {
    expect(buildPlexFilename({ showName: "Show", kind: "episode", season: -1, episode: 1.5 })).toBe(
      "Show - s01e02.mkv",
    );
    expect(buildPlexFilename({ showName: "Show", kind: "extra", extraIndex: -3.7 })).toBe("Show - extra-01.mkv");
  });
});

describe("normalizePositiveInteger", () => {
  it("rounds fractional values", () => {
    expect(normalizePositiveInteger(1.5)).toBe(2);
    expect(normalizePositiveInteger(1.4)).toBe(1);
  });

  it("clamps negative and zero values to 1", () => {
    expect(normalizePositiveInteger(-5)).toBe(1);
    expect(normalizePositiveInteger(0)).toBe(1);
  });

  it("falls back to the default for non-finite input", () => {
    expect(normalizePositiveInteger(NaN)).toBe(1);
    expect(normalizePositiveInteger(Infinity, 3)).toBe(3);
  });
});

describe("assignSequenceNumbers", () => {
  it("numbers episodes sequentially from startEpisode, skipping movies", () => {
    const items = [
      { id: "a", kind: "episode" as const },
      { id: "b", kind: "movie" as const },
      { id: "c", kind: "episode" as const },
    ];
    const assignment = assignSequenceNumbers(items, 5);
    expect(assignment.get("a")).toEqual({ episode: 5 });
    expect(assignment.get("b")).toBeUndefined();
    expect(assignment.get("c")).toEqual({ episode: 6 });
  });

  it("numbers extras separately from episodes, both starting fresh", () => {
    const items = [
      { id: "a", kind: "extra" as const },
      { id: "b", kind: "episode" as const },
      { id: "c", kind: "extra" as const },
    ];
    const assignment = assignSequenceNumbers(items, 1);
    expect(assignment.get("a")).toEqual({ extraIndex: 1 });
    expect(assignment.get("b")).toEqual({ episode: 1 });
    expect(assignment.get("c")).toEqual({ extraIndex: 2 });
  });

  it("reflects a kind change by renumbering everything after it", () => {
    const before = assignSequenceNumbers(
      [
        { id: "a", kind: "episode" as const },
        { id: "b", kind: "episode" as const },
        { id: "c", kind: "episode" as const },
      ],
      1,
    );
    expect(before.get("c")).toEqual({ episode: 3 });

    const after = assignSequenceNumbers(
      [
        { id: "a", kind: "episode" as const },
        { id: "b", kind: "movie" as const },
        { id: "c", kind: "episode" as const },
      ],
      1,
    );
    expect(after.get("c")).toEqual({ episode: 2 });
  });
});
