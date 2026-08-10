import { describe, expect, it } from "vitest";
import { locateTool, validateExecutable } from "./toolLocator";
import type { ProcessResult, ProcessRunner } from "./processRunner";

function fakeRunner(behavior: Record<string, ProcessResult | Error>): ProcessRunner {
  return {
    async run(executable) {
      const outcome = behavior[executable];
      if (outcome === undefined) throw new Error(`ENOENT: ${executable} not found`);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
}

describe("validateExecutable", () => {
  it("returns the version line on success", async () => {
    const runner = fakeRunner({
      "C:/ffmpeg/ffmpeg.exe": { exitCode: 0, stdout: "ffmpeg version 6.0\nmore\n", stderr: "" },
    });
    const result = await validateExecutable(runner, "C:/ffmpeg/ffmpeg.exe");
    expect(result).toEqual({ path: "C:/ffmpeg/ffmpeg.exe", version: "ffmpeg version 6.0" });
  });

  it("returns undefined when the process cannot be launched", async () => {
    const runner = fakeRunner({});
    const result = await validateExecutable(runner, "missing.exe");
    expect(result).toBeUndefined();
  });

  it("returns undefined on a non-zero exit code", async () => {
    const runner = fakeRunner({ bad: { exitCode: 1, stdout: "", stderr: "error" } });
    const result = await validateExecutable(runner, "bad");
    expect(result).toBeUndefined();
  });
});

describe("locateTool", () => {
  it("prefers the configured path when it validates", async () => {
    const runner = fakeRunner({
      "D:/custom/ffmpeg.exe": { exitCode: 0, stdout: "ffmpeg version custom", stderr: "" },
      ffmpeg: { exitCode: 0, stdout: "ffmpeg version path", stderr: "" },
    });
    const result = await locateTool(runner, ["D:/custom/ffmpeg.exe", "ffmpeg"]);
    expect(result?.version).toBe("ffmpeg version custom");
  });

  it("falls back to PATH when the configured path is invalid", async () => {
    const runner = fakeRunner({
      ffmpeg: { exitCode: 0, stdout: "ffmpeg version path", stderr: "" },
    });
    const result = await locateTool(runner, ["D:/missing/ffmpeg.exe", "ffmpeg"]);
    expect(result?.version).toBe("ffmpeg version path");
  });

  it("returns undefined when no candidate validates", async () => {
    const runner = fakeRunner({});
    const result = await locateTool(runner, [undefined, "ffmpeg"]);
    expect(result).toBeUndefined();
  });

  it("skips undefined candidates", async () => {
    const runner = fakeRunner({ ffmpeg: { exitCode: 0, stdout: "v1", stderr: "" } });
    const result = await locateTool(runner, [undefined, "ffmpeg"]);
    expect(result?.version).toBe("v1");
  });
});
