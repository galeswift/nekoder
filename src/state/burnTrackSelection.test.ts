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

  it("finds a burnable track among multiple copy-selections even when it isn't the first one selected", () => {
    const tracks = [track(2, "hdmv_pgs_subtitle"), track(3, "ass"), track(4, "ass")];
    // User copied both the PGS signs track (2) and the dialogue track (4); PGS was selected first.
    const result = selectBurnTrackIndexOnModeChange({ mode: "copy", trackIndexes: [2, 4] }, tracks);
    expect(result).toBe(4);
  });

  it("keeps the current burn track when already burning", () => {
    const tracks = [track(2, "ass"), track(3, "ass")];
    const result = selectBurnTrackIndexOnModeChange({ mode: "burn", trackIndexes: [], burnTrackIndex: 3 }, tracks);
    expect(result).toBe(3);
  });

  it("falls back to the first burnable track in the file when nothing is currently selected", () => {
    const tracks = [track(2, "ass"), track(3, "ass")];
    const result = selectBurnTrackIndexOnModeChange({ mode: "none", trackIndexes: [] }, tracks);
    expect(result).toBe(2);
  });

  it("returns undefined when the current selection has no burnable track, without picking an unrelated one", () => {
    const tracks = [track(2, "hdmv_pgs_subtitle"), track(3, "ass")];
    // Track 3 is burnable but wasn't selected by the user — must not be auto-picked here.
    const result = selectBurnTrackIndexOnModeChange({ mode: "copy", trackIndexes: [2] }, tracks);
    expect(result).toBeUndefined();
  });

  it("returns undefined when nothing is selected and no track in the file is burnable", () => {
    const tracks = [track(2, "hdmv_pgs_subtitle"), track(3, "dvd_subtitle")];
    const result = selectBurnTrackIndexOnModeChange({ mode: "none", trackIndexes: [] }, tracks);
    expect(result).toBeUndefined();
  });

  it("returns undefined when there are no subtitle tracks", () => {
    const result = selectBurnTrackIndexOnModeChange({ mode: "none", trackIndexes: [] }, []);
    expect(result).toBeUndefined();
  });
});
