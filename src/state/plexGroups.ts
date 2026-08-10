import {
  buildPlexFilename,
  buildPlexRelativeDir,
  finalizeFilename,
  guessShowName,
  type PlexKind,
} from "../media/plexNaming";

export interface PlexGroupConfig {
  enabled: boolean;
  showName: string;
  season: number;
  startEpisode: number;
}

/**
 * Groups source files by parent folder without importing node:path (this
 * module runs in the renderer, which must stay Node-free).
 */
export function groupKeyForFile(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  parts.pop();
  return parts.join("/");
}

export function folderLabelForGroupKey(groupKey: string): string {
  const parts = groupKey.split("/").filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? groupKey;
}

export function defaultGroupConfig(groupKey: string): PlexGroupConfig {
  return {
    enabled: true,
    showName: guessShowName(folderLabelForGroupKey(groupKey)),
    season: 1,
    startEpisode: 1,
  };
}

export interface PlexNameInput {
  kind: PlexKind;
  filenameOverride: string | undefined;
  episode?: number;
  extraIndex?: number;
}

/** Computes the suggested (or user-overridden) output filename for an item. */
export function computeItemPlexFilename(input: PlexNameInput, group: PlexGroupConfig): string {
  if (input.filenameOverride && input.filenameOverride.trim().length > 0) {
    return finalizeFilename(input.filenameOverride);
  }
  return buildPlexFilename({
    showName: group.showName,
    kind: input.kind,
    season: group.season,
    episode: input.episode,
    extraIndex: input.extraIndex,
  });
}

export function computeItemPlexRelativeDir(kind: PlexKind, group: PlexGroupConfig): string[] {
  return buildPlexRelativeDir({ showName: group.showName, kind });
}
