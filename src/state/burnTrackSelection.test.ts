import { describe, expect, it } from "vitest";
import { selectBurnTrackIndexOnModeChange } from "./burnTrackSelection";
import type { SubtitleTrack } from "../media/types";

function track(index: number, codec: string): SubtitleTrack {
  return { index, codec, language: undefined, title: undefined, disposition: { default: false, forced: false } };
}

describe("selectBurnTrackIndexOnModeChange", () => {
  it("prefers the currently copy-selected dialogue track over an earlier signs/songs track", () => {
    const tracks = [track(2, "ass"), track(3, "ass"), track(4, "ass")];
    // User is copying track 4 (full dialogue), which sorts after the signs/songs tracks.
    const result = selectBurnTrackIndexOnModeChange({ mode: "copy", trackIndexes: [4] }, tracks);
    expect(result).toBe(4);
  });

  it("keeps the current burn track when already burning", () => {
    const tracks = [track(2, "ass"), track(3, "ass")];
    const result = selectBurnTrackIndexOnModeChange({ mode: "burn", trackIndexes: [], burnTrackIndex: 3 }, tracks);
    expect(result).toBe(3);
  });

  it("falls back to the first burnable track when nothing was selected", () => {
    const tracks = [track(2, "ass"), track(3, "ass")];
    const result = selectBurnTrackIndexOnModeChange({ mode: "none", trackIndexes: [] }, tracks);
    expect(result).toBe(2);
  });

  it("falls back to the first burnable track when the current selection isn't burnable", () => {
    const tracks = [track(2, "hdmv_pgs_subtitle"), track(3, "ass")];
    const result = selectBurnTrackIndexOnModeChange({ mode: "copy", trackIndexes: [2] }, tracks);
    expect(result).toBe(3);
  });

  it("falls back to the first track at all when no track is burnable", () => {
    const tracks = [track(2, "hdmv_pgs_subtitle"), track(3, "dvd_subtitle")];
    const result = selectBurnTrackIndexOnModeChange({ mode: "none", trackIndexes: [] }, tracks);
    expect(result).toBe(2);
  });

  it("returns undefined when there are no subtitle tracks", () => {
    const result = selectBurnTrackIndexOnModeChange({ mode: "none", trackIndexes: [] }, []);
    expect(result).toBeUndefined();
  });
});
