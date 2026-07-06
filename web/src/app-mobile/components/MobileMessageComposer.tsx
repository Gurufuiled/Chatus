import { useCallback, useEffect, useRef } from 'react';
import { useComposerStore } from '@/stores/composerStore';
import { useSendMessageMutation } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';

interface MobileMessageComposerProps {
  chatId: string;
  disabled?: boolean;
}

export function MobileMessageComposer({ chatId, disabled = false }: MobileMessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draft = useComposerStore((s) => s.drafts[chatId] ?? '');
  const setDraft = useComposerStore((s) => s.setDraft);
  const clearDraft = useComposerStore((s) => s.clearDraft);
  const sendMutation = useSendMessageMutation();
  const { data: me } = useMeQuery();

  const resetHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
  };

  useEffect(() => {
    if (!draft) resetHeight();
  }, [draft]);

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const send = useCallback(() => {
    if (sendMutation.isPending || disabled || !me?.id) return;
    const text = draft.trim();
    if (!text) return;

    sendMutation.mutate(
      {
        chatId,
        text,
        clientTempId: crypto.randomUUID(),
      },
      {
        onSuccess: () => {
          clearDraft(chatId);
          resetHeight();
          textareaRef.current?.focus();
        },
      },
    );
  }, [chatId, clearDraft, disabled, draft, me?.id, sendMutation]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const canSend = draft.trim().length > 0 && !sendMutation.isPending && !disabled && !!me?.id;

  return (
    <div className="mobile-composer">
      <div className="mobile-composer__field-wrap">
        <textarea
          ref={textareaRef}
          className="mobile-composer__input"
          rows={1}
          placeholder="Сообщение"
          value={draft}
          onChange={(e) => setDraft(chatId, e.target.value)}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled || !me?.id}
          aria-label="Текст сообщения"
        />
      </div>
      <button
        type="button"
        className="mobile-composer__send"
        onClick={send}
        disabled={!canSend}
        aria-label="Отправить"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  );
}
