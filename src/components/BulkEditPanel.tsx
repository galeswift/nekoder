import { useState } from "react";
import type { QueueItem } from "../state/queueItem";
import type { PlexKind } from "../media/plexNaming";

interface BulkEditPanelProps {
  items: QueueItem[];
  namingLocked: boolean;
  seasonImpact: { groupCount: number; fileCount: number };
  onChangeKind: (kind: PlexKind) => void;
  onChangeSeason: (season: number) => void;
}

const KIND_OPTIONS: { value: PlexKind; label: string }[] = [
  { value: "episode", label: "Episode" },
  { value: "movie", label: "Movie" },
  { value: "extra", label: "Extra" },
];

export function BulkEditPanel({ items, namingLocked, seasonImpact, onChangeKind, onChangeSeason }: BulkEditPanelProps) {
  const [seasonInput, setSeasonInput] = useState("1");
  const firstKind = items[0]?.plexKind;
  const commonKind = firstKind && items.every((it) => it.plexKind === firstKind) ? firstKind : undefined;

  return (
    <div className="detail-panel">
      <div className="section">
        <div className="section-title">{items.length} files selected</div>
        <ul className="bulk-file-list">
          {items.map((it) => (
            <li key={it.id}>{it.filename}</li>
          ))}
        </ul>
      </div>

      {namingLocked && (
        <div className="reason" style={{ marginBottom: 8 }}>
          Naming is locked while the queue is running, since output paths have already been submitted for encoding.
        </div>
      )}

      <div className="section">
        <div className="section-title">Set kind{commonKind ? "" : " (mixed)"}</div>
        <div className="field-row">
          {KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={namingLocked}
              className={`btn kind-btn kind-${opt.value}${commonKind === opt.value ? " active" : ""}`}
              onClick={() => onChangeKind(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-title">Set season for folder(s)</div>
        <div className="reason" style={{ marginBottom: 8 }}>
          Season is set per source folder, not per file. Applying this updates every file in the same folder(s) as
          your selection: {seasonImpact.fileCount} file(s) across {seasonImpact.groupCount} folder(s).
        </div>
        <div className="field-row">
          <input
            type="number"
            min={1}
            value={seasonInput}
            disabled={namingLocked}
            onChange={(e) => setSeasonInput(e.target.value)}
            style={{ width: 60, flex: "none" }}
          />
          <button
            type="button"
            className="btn"
            disabled={namingLocked}
            onClick={() => onChangeSeason(seasonInput === "" ? 1 : Number(seasonInput))}
          >
            Apply to folder(s)
          </button>
        </div>
      </div>
    </div>
  );
}
