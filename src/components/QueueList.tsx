import type { QueueItem } from "../state/queueItem";
import type { PlexKind } from "../media/plexNaming";
import { formatDuration, formatPercent } from "../format";
import { StatusBadge } from "./StatusBadge";

function trackLabel(track: { language: string | undefined; title: string | undefined } | undefined): string {
  if (!track) return "—";
  return track.title ?? track.language ?? "—";
}

function basename(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return path.split(/[\\/]/).pop();
}

const KIND_LABELS: Record<PlexKind, string> = {
  episode: "Episode",
  movie: "Movie",
  extra: "Extra",
};

function KindTag({ kind }: { kind: PlexKind }) {
  return <span className={`kind-tag kind-${kind}`}>{KIND_LABELS[kind]}</span>;
}

interface QueueListProps {
  items: QueueItem[];
  selectedIds: string[];
  onSelect: (id: string, mode?: "single" | "toggle" | "range") => void;
}

export function QueueList({ items, selectedIds, onSelect }: QueueListProps) {
  if (items.length === 0) {
    return (
      <div className="queue-panel">
        <div className="queue-empty">No files yet. Use "Add Files" or "Add Folder" to get started.</div>
      </div>
    );
  }

  return (
    <div className="queue-panel">
      {selectedIds.length > 1 && (
        <div className="queue-selection-banner">{selectedIds.length} files selected</div>
      )}
      <div className="queue-list">
        {items.map((item) => {
          const audioTrack = item.media?.audioTracks.find((t) => t.index === item.audioTrackIndex);
          const subtitleTrack =
            item.subtitle.mode === "copy"
              ? item.media?.subtitleTracks.find((t) => t.index === item.subtitle.trackIndexes[0])
              : undefined;
          const destinationName = basename(item.outputPath);

          return (
            <div
              key={item.id}
              className={`queue-item${selectedIds.includes(item.id) ? " selected" : ""}`}
              onClick={(e) => {
                if (e.shiftKey) onSelect(item.id, "range");
                else if (e.ctrlKey || e.metaKey) onSelect(item.id, "toggle");
                else onSelect(item.id, "single");
              }}
            >
              <div className="queue-item-row">
                <span className="queue-item-name" title={item.inputPath}>
                  {item.filename}
                </span>
                <div className="queue-item-tags">
                  <KindTag kind={item.plexKind} />
                  <StatusBadge status={item.status} />
                </div>
              </div>
              <div className="queue-item-paths" title={item.outputPath}>
                <span className="queue-item-arrow">→</span>
                <span className="queue-item-dst">{destinationName ?? "—"}</span>
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
