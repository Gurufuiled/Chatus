import { useCallback, useEffect, useRef } from 'react';
import { useComposerStore } from '@/stores/composerStore';
import { useSendDiscussionMessageMutation } from '@/queries/channel.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { ComposerErrorBanner } from '@/features/conversation/ComposerErrorBanner';
import { MobileDiscussionReplyPreview } from './MobileDiscussionReplyPreview';
import type { MappedMessage } from '@/types/message';

interface MobileDiscussionComposerProps {
  channelId: string;
  postId: string;
  composerId: string;
  messages: MappedMessage[];
  disabled?: boolean;
  keyboardLift?: number;
  composerPaddingBottom?: number;
  onMessageSent?: () => void;
}

export function MobileDiscussionComposer({
  channelId,
  postId,
  composerId,
  messages,
  disabled = false,
  keyboardLift = 0,
  composerPaddingBottom,
  onMessageSent,
}: MobileDiscussionComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draft = useComposerStore((s) => s.drafts[composerId] ?? '');
  const setDraft = useComposerStore((s) => s.setDraft);
  const clearDraft = useComposerStore((s) => s.clearDraft);
  const replyToMessageId = useComposerStore((s) =>
    s.replyChatId === composerId ? s.replyToMessageId : null,
  );
  const clearReply = useComposerStore((s) => s.clearReply);
  const setComposerError = useComposerStore((s) => s.setComposerError);
  const composerFocusNonce = useComposerStore((s) => s.composerFocusNonce);
  const sendMessage = useSendDiscussionMessageMutation();
  const { data: me } = useMeQuery();
  const hasReply = !!replyToMessageId;

  useEffect(() => {
    if (composerFocusNonce > 0) textareaRef.current?.focus();
  }, [composerFocusNonce]);

  const resetHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
  };

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || sendMessage.isPending || disabled || !me?.id) return;

    sendMessage.mutate(
      {
        channelId,
        postId,
        content: text,
        replyToId: replyToMessageId ?? undefined,
      },
      {
        onSuccess: () => {
          clearDraft(composerId);
          clearReply();
          resetHeight();
          textareaRef.current?.focus();
          onMessageSent?.();
        },
        onError: (err) => {
          setComposerError(
            composerId,
            err instanceof Error ? err.message : 'Не удалось отправить',
          );
        },
      },
    );
  }, [
    channelId,
    clearDraft,
    clearReply,
    composerId,
    disabled,
    draft,
    me?.id,
    postId,
    replyToMessageId,
    sendMessage,
    setComposerError,
    onMessageSent,
  ]);

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const isSending = sendMessage.isPending;
  const isDisabled = disabled || !me?.id || isSending;
  const hasText = draft.trim().length > 0;
  const canSend = hasText;

  const wrapPaddingBottom =
    composerPaddingBottom !== undefined
      ? `${composerPaddingBottom}px`
      : 'calc(10px + var(--m-safe-bottom))';

  return (
    <footer
      className="mobile-channel-discussion__composer-wrap"
      style={{
        transform: keyboardLift > 0 ? `translateY(-${keyboardLift}px)` : undefined,
        paddingBottom: wrapPaddingBottom,
      }}
    >
      <ComposerErrorBanner chatId={composerId} />
      <div className={`mobile-composer-dock${hasReply ? ' mobile-composer-dock--reply' : ''}`}>
        <MobileDiscussionReplyPreview composerId={composerId} messages={messages} />
        <div className="mobile-composer">
          <div className="mobile-composer__shell">
            <div className="mobile-composer__field-wrap mobile-composer__field-wrap--discussion">
              <textarea
                ref={textareaRef}
                className="mobile-composer__input"
                rows={1}
                placeholder="Комментарий"
                value={draft}
                onChange={(e) => setDraft(composerId, e.target.value)}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                disabled={isDisabled}
                aria-label="Текст комментария"
              />
            </div>
            <button
              type="button"
              className="mobile-composer__send"
              onClick={send}
              disabled={!canSend || isDisabled}
              aria-label="Отправить"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
