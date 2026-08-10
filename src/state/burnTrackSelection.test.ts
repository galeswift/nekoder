import { describe, expect, it } from "vitest";
import { selectBurnTrackIndexesOnModeChange } from "./burnTrackSelection";
import type { SubtitleTrack } from "../media/types";

function track(index: number, codec: string): SubtitleTrack {
  return { index, codec, language: undefined, title: undefined, disposition: { default: false, forced: false } };
}

describe("selectBurnTrackIndexesOnModeChange", () => {
  it("carries over every currently copy-selected track that is burnable", () => {
    const tracks = [track(2, "ass"), track(3, "ass"), track(4, "ass")];
    const result = selectBurnTrackIndexesOnModeChange({ mode: "copy", trackIndexes: [3, 4] }, tracks);
    expect(result).toEqual([3, 4]);
  });

  it("drops copy-selected tracks that aren't burnable, keeping the rest", () => {
    const tracks = [track(2, "hdmv_pgs_subtitle"), track(3, "ass"), track(4, "ass")];
    const result = selectBurnTrackIndexesOnModeChange({ mode: "copy", trackIndexes: [2, 4] }, tracks);
    expect(result).toEqual([4]);
  });

  it("keeps the current burn selection when already burning", () => {
    const tracks = [track(2, "ass"), track(3, "ass")];
    const result = selectBurnTrackIndexesOnModeChange({ mode: "burn", trackIndexes: [3] }, tracks);
    expect(result).toEqual([3]);
  });

  it("selects every burnable track in the file when nothing is currently selected", () => {
    const tracks = [track(2, "ass"), track(3, "ass"), track(4, "hdmv_pgs_subtitle")];
    const result = selectBurnTrackIndexesOnModeChange({ mode: "none", trackIndexes: [] }, tracks);
    expect(result).toEqual([2, 3]);
  });

  it("returns an empty list when the current selection has no burnable track", () => {
    const tracks = [track(2, "hdmv_pgs_subtitle"), track(3, "ass")];
    const result = selectBurnTrackIndexesOnModeChange({ mode: "copy", trackIndexes: [2] }, tracks);
    expect(result).toEqual([]);
  });

  it("returns an empty list when nothing is selected and no track in the file is burnable", () => {
    const tracks = [track(2, "hdmv_pgs_subtitle"), track(3, "dvd_subtitle")];
    const result = selectBurnTrackIndexesOnModeChange({ mode: "none", trackIndexes: [] }, tracks);
    expect(result).toEqual([]);
  });

  it("returns an empty list when there are no subtitle tracks", () => {
    const result = selectBurnTrackIndexesOnModeChange({ mode: "none", trackIndexes: [] }, []);
    expect(result).toEqual([]);
  });
});
