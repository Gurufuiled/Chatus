import './pinned-message-bar.css';

interface PinnedMessageBarProps {
  preview: string;
  canUnpin?: boolean;
  onPress: () => void;
  onUnpin?: () => void;
}

export function PinnedMessageBar({
  preview,
  canUnpin = false,
  onPress,
  onUnpin,
}: PinnedMessageBarProps) {
  return (
    <div className="pinned-message-bar" role="status">
      <button
        type="button"
        className="pinned-message-bar__main"
        onClick={onPress}
        aria-label="Перейти к закреплённому сообщению"
      >
        <span className="pinned-message-bar__icon" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path
              d="M12 17v5M8 3h8l-1 5 3 2-1 3H7l-1-3 3-2-1-5z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="pinned-message-bar__text">
          <span className="pinned-message-bar__label">Закреплённое сообщение</span>
          <span className="pinned-message-bar__preview">{preview}</span>
        </span>
      </button>
      {canUnpin && onUnpin ? (
        <button
          type="button"
          className="pinned-message-bar__close"
          aria-label="Открепить"
          onClick={onUnpin}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
