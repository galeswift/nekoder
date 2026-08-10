import { useState } from "react";
import type { LogEvent } from "../ipc/api";

export function LogPanel({ entries }: { entries: LogEvent[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="log-panel">
      <div className="log-header" onClick={() => setExpanded((v) => !v)}>
        <span>{expanded ? "▼" : "▶"}</span>
        <span>Log ({entries.length})</span>
      </div>
      {expanded && (
        <div className="log-body">
          {entries.length === 0 && <div className="log-line">No log entries yet.</div>}
          {entries.map((entry, i) => (
            <div key={i} className={entry.level === "error" ? "log-line log-line-error" : "log-line"}>
              [{new Date(entry.timestamp).toLocaleTimeString()}] {entry.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
