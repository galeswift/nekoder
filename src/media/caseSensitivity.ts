import fs from "node:fs/promises";
import path from "node:path";

const PROBE_LOWER = ".hb-case-probe";
const PROBE_UPPER = ".HB-CASE-PROBE";

/**
 * Determines whether `directory` sits on a case-sensitive filesystem by
 * writing a marker file and checking whether a differently-cased path
 * resolves to it. Probes the real destination rather than guessing from the
 * OS, so it's correct for case-sensitive macOS/Windows volumes, Linux mounts
 * of case-insensitive filesystems, and network shares — cases where an
 * OS-level guess would be wrong.
 *
 * Falls back to `false` (case-insensitive) if the directory can't be probed
 * (doesn't exist yet, no write permission, etc.) — the pre-encode duplicate
 * check that consumes this is then more conservative (may flag distinct
 * differently-cased paths as conflicts) rather than silently missing a real
 * one.
 */
export async function isCaseSensitiveDirectory(directory: string): Promise<boolean> {
  const lowerPath = path.join(directory, PROBE_LOWER);
  const upperPath = path.join(directory, PROBE_UPPER);

  try {
    await fs.writeFile(lowerPath, "");
  } catch {
    return false;
  }

  try {
    await fs.access(upperPath);
    return false;
  } catch {
    return true;
  } finally {
    await fs.rm(lowerPath, { force: true }).catch(() => {});
  }
}
