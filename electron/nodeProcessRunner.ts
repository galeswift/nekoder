import { spawn } from "node:child_process";
import type { ProcessResult, ProcessRunner } from "../src/media/processRunner";

/**
 * Real ProcessRunner implementation. Always uses spawn (never a shell) so
 * paths with spaces or unusual characters are passed through untouched.
 */
export const nodeProcessRunner: ProcessRunner = {
  run(executable: string, args: string[]): Promise<ProcessResult> {
    return new Promise((resolve) => {
      const child = spawn(executable, args, { windowsHide: true });
      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", () => {
        resolve({ exitCode: null, stdout, stderr });
      });
      child.on("close", (code) => {
        resolve({ exitCode: code, stdout, stderr });
      });
    });
  },
};
