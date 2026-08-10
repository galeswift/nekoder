import type { AppSettings } from "../settings/types";
import type { FfmpegToolsStatus } from "../ipc/api";
import { Modal } from "./Modal";

interface SettingsModalProps {
  settings: AppSettings;
  toolsStatus: FfmpegToolsStatus | undefined;
  onUpdate: (partial: Partial<AppSettings>) => void;
  onBrowse: (kind: "ffmpeg" | "ffprobe") => void;
  onClose: () => void;
}

function ToolStatus({ label, status }: { label: string; status: { path: string; version: string } | undefined }) {
  if (status) {
    return (
      <div className="tool-status ok">
        {label} found: {status.version} ({status.path})
      </div>
    );
  }
  return <div className="tool-status missing">{label} not found. Configure the path below or add it to PATH.</div>;
}

export function SettingsModal({ settings, toolsStatus, onUpdate, onBrowse, onClose }: SettingsModalProps) {
  return (
    <Modal onClose={onClose}>
      <h2>Settings</h2>

      <div className="field">
        <label htmlFor="ffmpegPath">ffmpeg executable</label>
        <div className="field-row">
          <input
            id="ffmpegPath"
            type="text"
            value={settings.ffmpegPath ?? ""}
            placeholder="ffmpeg (using PATH)"
            onChange={(e) => onUpdate({ ffmpegPath: e.target.value || undefined })}
          />
          <button className="btn" onClick={() => onBrowse("ffmpeg")}>
            Browse…
          </button>
        </div>
        <ToolStatus label="ffmpeg" status={toolsStatus?.ffmpeg} />
      </div>

      <div className="field">
        <label htmlFor="ffprobePath">ffprobe executable</label>
        <div className="field-row">
          <input
            id="ffprobePath"
            type="text"
            value={settings.ffprobePath ?? ""}
            placeholder="ffprobe (using PATH)"
            onChange={(e) => onUpdate({ ffprobePath: e.target.value || undefined })}
          />
          <button className="btn" onClick={() => onBrowse("ffprobe")}>
            Browse…
          </button>
        </div>
        <ToolStatus label="ffprobe" status={toolsStatus?.ffprobe} />
      </div>

      <div className="field">
        <label htmlFor="audioLang">Preferred audio language (ISO 639-2, e.g. jpn)</label>
        <input
          id="audioLang"
          type="text"
          value={settings.preferredAudioLanguage}
          onChange={(e) => onUpdate({ preferredAudioLanguage: e.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="subLang">Preferred subtitle language (ISO 639-2, e.g. eng)</label>
        <input
          id="subLang"
          type="text"
          value={settings.preferredSubtitleLanguage}
          onChange={(e) => onUpdate({ preferredSubtitleLanguage: e.target.value })}
        />
      </div>

      <div className="field checkbox-field">
        <input
          id="preserveStructure"
          type="checkbox"
          checked={settings.preserveDirectoryStructure}
          onChange={(e) => onUpdate({ preserveDirectoryStructure: e.target.checked })}
        />
        <label htmlFor="preserveStructure">Preserve relative folder structure in output</label>
      </div>

      <div className="modal-actions">
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
