import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const writeFileMock = vi.fn();
const accessMock = vi.fn();
const rmMock = vi.fn().mockResolvedValue(undefined);

vi.mock("node:fs/promises", () => ({
  default: {
    writeFile: (...args: unknown[]) => writeFileMock(...args),
    access: (...args: unknown[]) => accessMock(...args),
    rm: (...args: unknown[]) => rmMock(...args),
  },
}));

const { isCaseSensitiveDirectory } = await import("./caseSensitivity");

describe("isCaseSensitiveDirectory", () => {
  beforeEach(() => {
    writeFileMock.mockReset().mockResolvedValue(undefined);
    accessMock.mockReset();
    rmMock.mockClear();
  });

  it("returns false when the differently-cased path resolves (case-insensitive filesystem)", async () => {
    accessMock.mockResolvedValue(undefined);
    await expect(isCaseSensitiveDirectory("C:/out")).resolves.toBe(false);
  });

  it("returns true when the differently-cased path does not resolve (case-sensitive filesystem)", async () => {
    accessMock.mockRejectedValue(new Error("ENOENT"));
    await expect(isCaseSensitiveDirectory("/out")).resolves.toBe(true);
  });

  it("returns false (safe default) when the directory can't be probed at all", async () => {
    writeFileMock.mockRejectedValue(new Error("EACCES"));
    await expect(isCaseSensitiveDirectory("/no-access")).resolves.toBe(false);
    expect(accessMock).not.toHaveBeenCalled();
  });

  it("cleans up the probe file after checking", async () => {
    accessMock.mockResolvedValue(undefined);
    await isCaseSensitiveDirectory("C:/out");
    expect(rmMock).toHaveBeenCalledWith(path.join("C:/out", ".hb-case-probe"), { force: true });
  });
});
