import type { QueueItem } from "../state/queueItem";
import { formatDuration, formatPercent } from "../format";
import { StatusBadge } from "./StatusBadge";

function trackLabel(track: { language: string | undefined; title: string | undefined } | undefined): string {
  if (!track) return "—";
  return track.title ?? track.language ?? "—";
}

interface QueueListProps {
  items: QueueItem[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

export function QueueList({ items, selectedId, onSelect }: QueueListProps) {
  if (items.length === 0) {
    return (
      <div className="queue-panel">
        <div className="queue-empty">No files yet. Use "Add Files" or "Add Folder" to get started.</div>
      </div>
    );
  }

  return (
    <div className="queue-panel">
      <div className="queue-list">
        {items.map((item) => {
          const audioTrack = item.media?.audioTracks.find((t) => t.index === item.audioTrackIndex);
          const subtitleTrack =
            item.subtitle.mode === "copy"
              ? item.media?.subtitleTracks.find((t) => t.index === item.subtitle.trackIndexes[0])
              : undefined;

          return (
            <div
              key={item.id}
              className={`queue-item${item.id === selectedId ? " selected" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              <div className="queue-item-row">
                <span className="queue-item-name" title={item.inputPath}>
                  {item.filename}
                </span>
                <StatusBadge status={item.status} />
              </div>
              <div className="queue-item-meta">
                <span>JA: {trackLabel(audioTrack)}</span>
                <span>EN subs: {item.subtitle.mode === "none" ? "None" : trackLabel(subtitleTrack)}</span>
                <span>{formatDuration(item.media?.durationSeconds)}</span>
              </div>
              {item.status === "encoding" && (
                <progress className="encode-progress" value={item.progress?.percent ?? 0} max={100} />
              )}
              {item.status === "encoding" && (
                <div className="queue-item-meta">
                  <span>{formatPercent(item.progress?.percent)}</span>
                </div>
              )}
              {item.status === "error" && item.errorMessage && (
                <div className="queue-item-meta">
                  <span title={item.errorMessage}>{item.errorMessage}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
