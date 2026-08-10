import type { SubtitleSelection } from "../media/ffmpegCommand";
import { isBurnableSubtitleCodec } from "../media/ffmpegCommand";
import type { SubtitleTrack } from "../media/types";

/**
 * Picks the subtitle track to burn in when the user switches subtitle mode
 * to "burn". Anime files commonly list signs/songs tracks before the
 * full-dialogue track, so this prefers whatever the user already had
 * selected (the burn track if already burning, or the first copy-selected
 * track) as long as it's burnable, only falling back to "first burnable
 * track in the file" when nothing was already selected or the selection
 * isn't burnable.
 */
export function selectBurnTrackIndexOnModeChange(
  currentSubtitle: SubtitleSelection,
  subtitleTracks: SubtitleTrack[],
): number | undefined {
  const currentlySelectedIndex =
    currentSubtitle.mode === "burn" ? currentSubtitle.burnTrackIndex : currentSubtitle.trackIndexes[0];
  const currentlySelectedTrack = subtitleTracks.find((t) => t.index === currentlySelectedIndex);

  if (currentlySelectedTrack && isBurnableSubtitleCodec(currentlySelectedTrack.codec)) {
    return currentlySelectedTrack.index;
  }

  const firstBurnable = subtitleTracks.find((t) => isBurnableSubtitleCodec(t.codec));
  return (firstBurnable ?? subtitleTracks[0])?.index;
}
