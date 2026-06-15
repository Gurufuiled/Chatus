import { useToggleReactionMutation } from '@/queries/messages.queries';

const DEFAULT_EMOJI = '❤️';

interface MessageQuickReactionProps {
  chatId: string;
  messageId: string;
  disabled?: boolean;
}

export function MessageQuickReaction({
  chatId,
  messageId,
  disabled = false,
}: MessageQuickReactionProps) {
  const toggleReaction = useToggleReactionMutation();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || toggleReaction.isPending) return;
    toggleReaction.mutate({ chatId, messageId, emoji: DEFAULT_EMOJI });
  };

  return (
    <button
      type="button"
      className="message-quick-reaction"
      aria-label="Поставить реакцию"
      title="Реакция"
      disabled={disabled || toggleReaction.isPending}
      onClick={handleClick}
    >
      <span className="message-quick-reaction__emoji">{DEFAULT_EMOJI}</span>
    </button>
  );
}
