import type { ProcessRunner } from "./processRunner";

export interface ToolLocation {
  path: string;
  version: string;
}

/**
 * Runs `<candidatePath> -version` and returns the location/version if it
 * looks like a real ffmpeg/ffprobe build, or undefined if the candidate
 * can't be run at all (not found, not executable, wrong binary, etc.).
 */
export async function validateExecutable(
  runner: ProcessRunner,
  candidatePath: string,
): Promise<ToolLocation | undefined> {
  try {
    const result = await runner.run(candidatePath, ["-version"]);
    if (result.exitCode === 0 && result.stdout.trim().length > 0) {
      const firstLine = result.stdout.split(/\r?\n/)[0] ?? "";
      return { path: candidatePath, version: firstLine.trim() };
    }
  } catch {
    // Candidate could not be launched; fall through to undefined.
  }
  return undefined;
}

/**
 * Tries each candidate in order (typically: configured path, then bare
 * executable name relying on PATH resolution) and returns the first one
 * that validates successfully.
 */
export async function locateTool(
  runner: ProcessRunner,
  candidates: (string | undefined)[],
): Promise<ToolLocation | undefined> {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const result = await validateExecutable(runner, candidate);
    if (result) return result;
  }
  return undefined;
}
