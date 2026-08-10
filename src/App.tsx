import { Toolbar } from "./components/Toolbar";
import { QueueList } from "./components/QueueList";
import { FileDetails } from "./components/FileDetails";
import { BulkEditPanel } from "./components/BulkEditPanel";
import { LogPanel } from "./components/LogPanel";
import { SettingsModal } from "./components/SettingsModal";
import { useAppController } from "./state/useAppController";

export function App() {
  const controller = useAppController();
  const { settings, selectedItem, selectedItems } = controller;

  return (
    <div className="app">
      <Toolbar
        outputFolder={settings?.lastOutputDirectory}
        isEncoding={controller.isEncoding}
        isStarting={controller.isStarting}
        canStartQueue={controller.canStartQueue}
        onAddFiles={() => void controller.onAddFiles()}
        onAddFolder={() => void controller.onAddFolder()}
        onChooseOutputFolder={() => void controller.onChooseOutputFolder()}
        onStartQueue={() => void controller.onStartQueue()}
        onCancelCurrent={() => void controller.onCancelCurrent()}
        onOpenSettings={() => controller.setShowSettings(true)}
      />

      <div className="main">
        <QueueList items={controller.items} selectedIds={controller.selectedIds} onSelect={controller.onSelect} />

        {selectedItems.length > 1 ? (
          <BulkEditPanel
            items={selectedItems}
            onChangeKind={(kind) => controller.onBulkChangeKind(controller.selectedIds, kind)}
            onChangeSeason={(season) => controller.onBulkChangeSeason(controller.selectedIds, season)}
          />
        ) : selectedItem ? (
          <FileDetails
            item={selectedItem}
            plexInfo={controller.getPlexInfoForItem(selectedItem)}
            onChangePreset={(presetId) => controller.onChangePreset(selectedItem.id, presetId)}
            onChangeAudioTrack={(index) => controller.onChangeAudioTrack(selectedItem.id, index)}
            onChangeSubtitleMode={(mode) => controller.onChangeSubtitleMode(selectedItem.id, mode)}
            onToggleSubtitleTrack={(index) => controller.onToggleSubtitleTrack(selectedItem.id, index)}
            onChangePlexEnabled={(enabled) => controller.onChangePlexEnabled(selectedItem.id, enabled)}
            onChangeShowName={(showName) => controller.onChangeShowName(selectedItem.id, showName)}
            onChangeSeason={(season) => controller.onChangeSeason(selectedItem.id, season)}
            onChangeStartEpisode={(startEpisode) => controller.onChangeStartEpisode(selectedItem.id, startEpisode)}
            onChangeItemKind={(kind) => controller.onChangeItemKind(selectedItem.id, kind)}
            onChangeFilenameOverride={(override) => controller.onChangeFilenameOverride(selectedItem.id, override)}
          />
        ) : (
          <div className="detail-panel">
            <div className="detail-empty">
              Select a file from the queue to view its details. Ctrl/Cmd+click or Shift+click to select multiple.
            </div>
          </div>
        )}
      </div>

      <LogPanel entries={controller.logs} />

      {controller.showSettings && settings && (
        <SettingsModal
          settings={settings}
          toolsStatus={controller.toolsStatus}
          onUpdate={(partial) => void controller.onUpdateSettings(partial)}
          onBrowse={(kind) => void controller.onBrowseExecutable(kind)}
          onClose={() => controller.setShowSettings(false)}
        />
      )}
    </div>
  );
}
