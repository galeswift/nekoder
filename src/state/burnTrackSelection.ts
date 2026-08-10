import type { SubtitleSelection } from "../media/ffmpegCommand";
import { isBurnableSubtitleCodec } from "../media/ffmpegCommand";
import type { SubtitleTrack } from "../media/types";

/**
 * Picks the subtitle track to burn in when the user switches subtitle mode
 * to "burn". Scans every track the user currently has selected (all
 * copy-selected tracks, in file order, or the current burn track) for a
 * burnable one — anime files commonly list signs/songs before full-dialogue
 * subtitles, so checking only the first selection could skip past a selected
 * dialogue track in favor of an unrelated one. Falls back to the first
 * burnable track in the file only when nothing is currently selected.
 * Returns undefined when no candidate is burnable, rather than picking an
 * unburnable track that would be guaranteed to fail at encode time — callers
 * should disable the Burn option when the file has no burnable track at all.
 */
export function selectBurnTrackIndexOnModeChange(
  currentSubtitle: SubtitleSelection,
  subtitleTracks: SubtitleTrack[],
): number | undefined {
  const selectedIndexes = new Set(
    currentSubtitle.mode === "burn"
      ? currentSubtitle.burnTrackIndex !== undefined
        ? [currentSubtitle.burnTrackIndex]
        : []
      : currentSubtitle.mode === "copy"
        ? currentSubtitle.trackIndexes
        : [],
  );

  if (selectedIndexes.size > 0) {
    return subtitleTracks.find((t) => selectedIndexes.has(t.index) && isBurnableSubtitleCodec(t.codec))?.index;
  }

  return subtitleTracks.find((t) => isBurnableSubtitleCodec(t.codec))?.index;
}
