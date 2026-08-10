import { useState } from "react";
import type { QueueItem } from "../state/queueItem";
import type { PlexKind } from "../media/plexNaming";

interface BulkEditPanelProps {
  items: QueueItem[];
  onChangeKind: (kind: PlexKind) => void;
  onChangeSeason: (season: number) => void;
}

const KIND_OPTIONS: { value: PlexKind; label: string }[] = [
  { value: "episode", label: "Episode" },
  { value: "movie", label: "Movie" },
  { value: "extra", label: "Extra" },
];

export function BulkEditPanel({ items, onChangeKind, onChangeSeason }: BulkEditPanelProps) {
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

      <div className="section">
        <div className="section-title">Set kind{commonKind ? "" : " (mixed)"}</div>
        <div className="field-row">
          {KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`btn kind-btn kind-${opt.value}${commonKind === opt.value ? " active" : ""}`}
              onClick={() => onChangeKind(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-title">Set season</div>
        <div className="field-row">
          <input
            type="number"
            min={1}
            value={seasonInput}
            onChange={(e) => setSeasonInput(e.target.value)}
            style={{ width: 60, flex: "none" }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => onChangeSeason(seasonInput === "" ? 1 : Number(seasonInput))}
          >
            Apply to selected
          </button>
        </div>
      </div>
    </div>
  );
}
