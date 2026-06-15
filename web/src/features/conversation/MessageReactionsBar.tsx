import { useToggleReactionMutation } from '@/queries/messages.queries';
import type { MappedMessageReaction } from '@/types/message';

interface MessageReactionsBarProps {
  chatId: string;
  messageId: string;
  reactions: MappedMessageReaction[];
  isOutgoing: boolean;
  disabled?: boolean;
}

export function MessageReactionsBar({
  chatId,
  messageId,
  reactions,
  isOutgoing,
  disabled = false,
}: MessageReactionsBarProps) {
  const toggleReaction = useToggleReactionMutation();

  if (!reactions.length) return null;

  return (
    <div
      className={`message-reactions${isOutgoing ? ' message-reactions--outgoing' : ' message-reactions--incoming'}`}
    >
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          className={`message-reactions__chip${reaction.reacted_by_me ? ' message-reactions__chip--mine' : ''}`}
          disabled={disabled || toggleReaction.isPending}
          aria-label={`Реакция ${reaction.emoji}`}
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) return;
            toggleReaction.mutate({ chatId, messageId, emoji: reaction.emoji });
          }}
        >
          <span className="message-reactions__emoji">{reaction.emoji}</span>
          {reaction.count > 1 ? (
            <span className="message-reactions__count">{reaction.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
