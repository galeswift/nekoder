export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Abstraction around launching an external process. The real implementation
 * (child_process.spawn) lives in the Electron main process; this interface
 * lets tool-discovery and probing logic be unit-tested without spawning
 * anything real.
 */
export interface ProcessRunner {
  run(executable: string, args: string[]): Promise<ProcessResult>;
}
