interface ToolbarProps {
  outputFolder: string | undefined;
  isEncoding: boolean;
  isStarting: boolean;
  canStartQueue: boolean;
  onAddFiles: () => void;
  onAddFolder: () => void;
  onChooseOutputFolder: () => void;
  onStartQueue: () => void;
  onCancelCurrent: () => void;
  onOpenSettings: () => void;
}

export function Toolbar({
  outputFolder,
  isEncoding,
  isStarting,
  canStartQueue,
  onAddFiles,
  onAddFolder,
  onChooseOutputFolder,
  onStartQueue,
  onCancelCurrent,
  onOpenSettings,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <button className="btn" onClick={onAddFiles}>
        Add Files
      </button>
      <button className="btn" onClick={onAddFolder}>
        Add Folder
      </button>
      <button className="btn" onClick={onChooseOutputFolder}>
        Output Folder
      </button>
      <span className="toolbar-status" title={outputFolder}>
        {outputFolder ? `→ ${outputFolder}` : "No output folder chosen"}
      </span>
      <div className="toolbar-spacer" />
      <button
        className="btn btn-primary"
        onClick={onStartQueue}
        disabled={!canStartQueue || isEncoding || isStarting}
      >
        Start Queue
      </button>
      <button className="btn btn-danger" onClick={onCancelCurrent} disabled={!isEncoding}>
        Cancel Current Encode
      </button>
      <button className="btn" onClick={onOpenSettings}>
        Settings
      </button>
    </div>
  );
}
