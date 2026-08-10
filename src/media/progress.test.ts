import { describe, expect, it } from "vitest";
import { computeEncodeProgress, createProgressParser } from "./progress";

function block(overrides: Record<string, string> = {}, status = "continue"): string {
  const fields: Record<string, string> = {
    frame: "300",
    fps: "24.00",
    bitrate: "1234.5kbits/s",
    total_size: "1048576",
    out_time_us: "12500000",
    out_time_ms: "12500000",
    out_time: "00:00:12.500000",
    dup_frames: "0",
    drop_frames: "0",
    speed: "1.5x",
    ...overrides,
  };
  const lines = Object.entries(fields).map(([k, v]) => `${k}=${v}`);
  lines.push(`progress=${status}`);
  return lines.join("\n") + "\n";
}

describe("createProgressParser", () => {
  it("parses a single complete block", () => {
    const parser = createProgressParser();
    const events = parser.feed(block());

    expect(events).toHaveLength(1);
    expect(events[0]!.outTimeSeconds).toBeCloseTo(12.5, 3);
    expect(events[0]!.speed).toBeCloseTo(1.5, 3);
    expect(events[0]!.status).toBe("continue");
  });

  it("parses multiple blocks fed in one chunk", () => {
    const parser = createProgressParser();
    const events = parser.feed(block({ out_time_us: "1000000" }) + block({ out_time_us: "2000000" }));

    expect(events).toHaveLength(2);
    expect(events[0]!.outTimeSeconds).toBeCloseTo(1, 3);
    expect(events[1]!.outTimeSeconds).toBeCloseTo(2, 3);
  });

  it("handles a block split across multiple feed() calls", () => {
    const parser = createProgressParser();
    const full = block({ out_time_us: "5000000" });
    const splitAt = Math.floor(full.length / 2);

    const first = parser.feed(full.slice(0, splitAt));
    expect(first).toHaveLength(0);

    const second = parser.feed(full.slice(splitAt));
    expect(second).toHaveLength(1);
    expect(second[0]!.outTimeSeconds).toBeCloseTo(5, 3);
  });

  it("recognizes the terminal progress=end block", () => {
    const parser = createProgressParser();
    const events = parser.feed(block({}, "end"));
    expect(events[0]!.status).toBe("end");
  });

  it("returns undefined fields gracefully when a key is missing", () => {
    const parser = createProgressParser();
    const events = parser.feed("frame=1\nprogress=continue\n");
    expect(events[0]!.speed).toBeUndefined();
    expect(events[0]!.outTimeSeconds).toBeUndefined();
  });
});

describe("computeEncodeProgress", () => {
  it("computes percent complete from out_time and duration", () => {
    const progress = computeEncodeProgress(
      { frame: 1, fps: 24, bitrateKbps: 1000, outTimeSeconds: 60, speed: 2, status: "continue" },
      240,
      30,
    );
    expect(progress.percent).toBeCloseTo(25, 3);
  });

  it("computes ETA from remaining duration and speed", () => {
    const progress = computeEncodeProgress(
      { frame: 1, fps: 24, bitrateKbps: 1000, outTimeSeconds: 60, speed: 2, status: "continue" },
      240,
      30,
    );
    expect(progress.etaSeconds).toBeCloseTo(90, 3);
  });

  it("returns undefined percent/eta when duration is unknown", () => {
    const progress = computeEncodeProgress(
      { frame: 1, fps: 24, bitrateKbps: 1000, outTimeSeconds: 60, speed: 2, status: "continue" },
      undefined,
      30,
    );
    expect(progress.percent).toBeUndefined();
    expect(progress.etaSeconds).toBeUndefined();
  });

  it("clamps percent to 100 even if out_time slightly exceeds duration", () => {
    const progress = computeEncodeProgress(
      { frame: 1, fps: 24, bitrateKbps: 1000, outTimeSeconds: 241, speed: 2, status: "continue" },
      240,
      30,
    );
    expect(progress.percent).toBe(100);
  });
});
