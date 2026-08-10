import path from "node:path";

export function isMkvFile(filename: string): boolean {
  return path.extname(filename).toLowerCase() === ".mkv";
}

export interface OutputPathOptions {
  /** Root directory the file was imported from (a folder, or the file's own parent for single-file imports). */
  sourceRoot: string;
  /** Absolute path to the source file. */
  filePath: string;
  /** Directory the user chose as the encode destination. */
  outputRoot: string;
  /** Whether to mirror the source's relative directory structure under outputRoot. */
  preserveStructure: boolean;
}

/**
 * Computes the destination path for a source file, mirroring its position
 * relative to sourceRoot under outputRoot when preserveStructure is true.
 * Always outputs a .mkv extension and never overwrites the source filename
 * with anything other than its own name (first-version behavior: no
 * renaming beyond extension normalization).
 */
export function computeOutputPath(options: OutputPathOptions): string {
  const { sourceRoot, filePath, outputRoot, preserveStructure } = options;
  const parsed = path.parse(filePath);
  const outputFilename = `${parsed.name}.mkv`;

  if (!preserveStructure) {
    return path.join(outputRoot, outputFilename);
  }

  const relativeDir = path.relative(sourceRoot, parsed.dir);
  // path.relative can climb above sourceRoot (e.g. "..") for files outside
  // it; fall back to a flat layout rather than writing outside outputRoot.
  const safeRelativeDir = relativeDir.startsWith("..") || path.isAbsolute(relativeDir) ? "" : relativeDir;

  return path.join(outputRoot, safeRelativeDir, outputFilename);
}

export type PathExistsCheck = (candidatePath: string) => boolean | Promise<boolean>;

/**
 * Returns true when the computed output path already exists, meaning the
 * item should be marked as a Conflict rather than silently overwritten.
 */
export async function hasOutputConflict(
  outputPath: string,
  pathExists: PathExistsCheck,
): Promise<boolean> {
  return pathExists(outputPath);
}
