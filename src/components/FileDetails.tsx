import type { QueueItem } from "../state/queueItem";
import type { PresetId } from "../media/presets";
import { PRESETS } from "../media/presets";
import { isBurnableSubtitleCodec, type SubtitleMode } from "../media/ffmpegCommand";
import { formatDuration } from "../format";

interface FileDetailsProps {
  item: QueueItem;
  onChangePreset: (presetId: PresetId) => void;
  onChangeAudioTrack: (index: number) => void;
  onChangeSubtitleMode: (mode: SubtitleMode) => void;
  onToggleSubtitleTrack: (index: number) => void;
  onChangeBurnTrack: (index: number) => void;
}

export function FileDetails({
  item,
  onChangePreset,
  onChangeAudioTrack,
  onChangeSubtitleMode,
  onToggleSubtitleTrack,
  onChangeBurnTrack,
}: FileDetailsProps) {
  const media = item.media;
  const hasBurnableTrack = media?.subtitleTracks.some((t) => isBurnableSubtitleCodec(t.codec)) ?? false;
  const burnUnavailableReason = "No text-based subtitle track available to burn in (only image-based tracks found).";

  return (
    <div className="detail-panel">
      <div className="section">
        <div className="section-title">Source</div>
        <dl className="kv-grid">
          <dt>Filename</dt>
          <dd>{item.filename}</dd>
          <dt>Full path</dt>
          <dd>{item.inputPath}</dd>
          <dt>Resolution</dt>
          <dd>
            {media?.videoTracks[0]?.width && media.videoTracks[0]?.height
              ? `${media.videoTracks[0].width}x${media.videoTracks[0].height}`
              : "—"}
          </dd>
          <dt>Duration</dt>
          <dd>{formatDuration(media?.durationSeconds)}</dd>
          <dt>Video codec</dt>
          <dd>{media?.videoTracks[0]?.codec ?? "—"}</dd>
          <dt>Output path</dt>
          <dd>{item.outputPath ?? "—"}</dd>
        </dl>
      </div>

      <div className="section">
        <div className="section-title">Preset</div>
        <select value={item.presetId} onChange={(e) => onChangePreset(e.target.value as PresetId)}>
          {Object.values(PRESETS).map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </div>

      <div className="section">
        <div className="section-title">Audio tracks</div>
        {!media || media.audioTracks.length === 0 ? (
          <div className="detail-empty">No audio tracks found.</div>
        ) : (
          <table className="tracks">
            <thead>
              <tr>
                <th></th>
                <th>#</th>
                <th>Language</th>
                <th>Codec</th>
                <th>Channels</th>
                <th>Layout</th>
                <th>Title</th>
                <th>Default</th>
              </tr>
            </thead>
            <tbody>
              {media.audioTracks.map((track) => (
                <tr
                  key={track.index}
                  className={track.index === item.audioTrackIndex ? "track-selected" : undefined}
                  onClick={() => onChangeAudioTrack(track.index)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <input type="radio" checked={track.index === item.audioTrackIndex} readOnly />
                  </td>
                  <td>{track.index}</td>
                  <td>{track.language ?? "—"}</td>
                  <td>{track.codec}</td>
                  <td>{track.channels ?? "—"}</td>
                  <td>{track.channelLayout ?? "—"}</td>
                  <td>{track.title ?? "—"}</td>
                  <td>{track.disposition.default ? "Yes" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {item.audioReason && <div className="reason">{item.audioReason}</div>}
      </div>

      <div className="section">
        <div className="section-title">Subtitle tracks</div>
        <div className="field-row" style={{ marginBottom: 8 }}>
          <select value={item.subtitle.mode} onChange={(e) => onChangeSubtitleMode(e.target.value as SubtitleMode)}>
            <option value="copy">Copy into output</option>
            <option value="burn" disabled={!hasBurnableTrack} title={!hasBurnableTrack ? burnUnavailableReason : undefined}>
              Burn into video
            </option>
            <option value="none">No subtitles</option>
          </select>
        </div>
        {!media || media.subtitleTracks.length === 0 ? (
          <div className="detail-empty">No subtitle tracks found.</div>
        ) : (
          <table className="tracks">
            <thead>
              <tr>
                <th></th>
                <th>#</th>
                <th>Language</th>
                <th>Codec</th>
                <th>Title</th>
                <th>Forced</th>
                <th>Default</th>
              </tr>
            </thead>
            <tbody>
              {media.subtitleTracks.map((track) => {
                const isSelected =
                  item.subtitle.mode === "copy"
                    ? item.subtitle.trackIndexes.includes(track.index)
                    : item.subtitle.mode === "burn"
                      ? item.subtitle.burnTrackIndex === track.index
                      : false;
                const unburnable = item.subtitle.mode === "burn" && !isBurnableSubtitleCodec(track.codec);
                const disabled = item.subtitle.mode === "none" || unburnable;

                return (
                  <tr
                    key={track.index}
                    className={isSelected ? "track-selected" : undefined}
                    onClick={() => {
                      if (disabled) return;
                      if (item.subtitle.mode === "copy") onToggleSubtitleTrack(track.index);
                      else onChangeBurnTrack(track.index);
                    }}
                    style={{ cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}
                    title={unburnable ? `"${track.codec}" is image-based and can't be burned in — copy it instead.` : undefined}
                  >
                    <td>
                      {item.subtitle.mode === "burn" ? (
                        <input type="radio" checked={isSelected} readOnly disabled={disabled} />
                      ) : (
                        <input type="checkbox" checked={isSelected} readOnly disabled={disabled} />
                      )}
                    </td>
                    <td>{track.index}</td>
                    <td>{track.language ?? "—"}</td>
                    <td>{track.codec}</td>
                    <td>{track.title ?? "—"}</td>
                    <td>{track.disposition.forced ? "Yes" : ""}</td>
                    <td>{track.disposition.default ? "Yes" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {item.subtitleReason && <div className="reason">{item.subtitleReason}</div>}
      </div>
    </div>
  );
}
