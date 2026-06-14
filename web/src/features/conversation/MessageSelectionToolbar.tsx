import { useSelectionStore } from '@/stores/selectionStore';
import './message-selection-toolbar.css';

interface MessageSelectionToolbarProps {
  chatId: string;
  onForward: (messageIds: string[]) => void;
  onDelete: (messageIds: string[]) => void;
}

export function MessageSelectionToolbar({
  chatId,
  onForward,
  onDelete,
}: MessageSelectionToolbarProps) {
  const isActive = useSelectionStore((s) => s.isActive && s.chatId === chatId);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const exitSelection = useSelectionStore((s) => s.exitSelection);

  if (!isActive || selectedIds.length === 0) return null;

  return (
    <div className="message-selection-toolbar" role="toolbar" aria-label="Selected messages">
      <span className="message-selection-toolbar__count">
        {selectedIds.length} выбрано
      </span>
      <div className="message-selection-toolbar__actions">
        <button
          type="button"
          className="message-selection-toolbar__btn"
          onClick={() => onForward(selectedIds)}
        >
          Переслать
        </button>
        <button
          type="button"
          className="message-selection-toolbar__btn message-selection-toolbar__btn--danger"
          onClick={() => onDelete(selectedIds)}
        >
          Удалить
        </button>
        <button
          type="button"
          className="message-selection-toolbar__btn message-selection-toolbar__btn--ghost"
          onClick={exitSelection}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
