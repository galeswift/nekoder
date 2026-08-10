import type { SubtitleSelection } from "../media/ffmpegCommand";
import { isBurnableSubtitleCodec } from "../media/ffmpegCommand";
import type { SubtitleTrack } from "../media/types";

/**
 * Picks which subtitle tracks to burn in when the user switches subtitle
 * mode to "burn": whichever of the currently-selected tracks are burnable,
 * or every burnable track in the file if nothing was selected yet.
 */
export function selectBurnTrackIndexesOnModeChange(
  currentSubtitle: SubtitleSelection,
  subtitleTracks: SubtitleTrack[],
): number[] {
  if (currentSubtitle.mode === "none") {
    return subtitleTracks.filter((t) => isBurnableSubtitleCodec(t.codec)).map((t) => t.index);
  }

  return subtitleTracks
    .filter((t) => currentSubtitle.trackIndexes.includes(t.index) && isBurnableSubtitleCodec(t.codec))
    .map((t) => t.index);
}
