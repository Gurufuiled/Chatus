import { useEffect, useRef, useCallback } from 'react';
import { useComposerStore, EMPTY_PENDING_ATTACHMENTS } from '@/stores/composerStore';
import { useSendMessageMutation } from '@/queries/messages.queries';
import { useSendPendingAttachmentsMutation } from '@/queries/media.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { AttachmentPicker } from '@/features/conversation/AttachmentPicker';
import { MobileComposerAttachmentPreview } from './MobileComposerAttachmentPreview';
import { ComposerErrorBanner } from '@/features/conversation/ComposerErrorBanner';
import { MobileComposerReplyPreview } from './MobileComposerReplyPreview';
import { useVoiceRecorder } from '@/features/conversation/useVoiceRecorder';
import { MobileComposerVoiceControls } from './MobileComposerVoiceControls';

interface MobileMessageComposerProps {
  chatId: string;
  disabled?: boolean;
  keyboardLift?: number;
  composerPaddingBottom?: number;
}

export function MobileMessageComposer({
  chatId,
  disabled = false,
  keyboardLift = 0,
  composerPaddingBottom,
}: MobileMessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draft = useComposerStore((s) => s.drafts[chatId] ?? '');
  const pendingAttachments = useComposerStore((s) => s.pendingAttachments[chatId]);
  const attachments = pendingAttachments ?? EMPTY_PENDING_ATTACHMENTS;
  const setDraft = useComposerStore((s) => s.setDraft);
  const clearDraft = useComposerStore((s) => s.clearDraft);
  const setAttachmentPickerOpen = useComposerStore((s) => s.setAttachmentPickerOpen);
  const replyToMessageId = useComposerStore((s) =>
    s.replyChatId === chatId ? s.replyToMessageId : null,
  );
  const clearReply = useComposerStore((s) => s.clearReply);
  const composerFocusNonce = useComposerStore((s) => s.composerFocusNonce);
  const hasReply = !!replyToMessageId;
  const sendMutation = useSendMessageMutation();
  const sendPendingMutation = useSendPendingAttachmentsMutation();
  const { data: me } = useMeQuery();

  const voiceDisabled = disabled || !me?.id;
  const voice = useVoiceRecorder(chatId, voiceDisabled);

  const resetHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
  };

  useEffect(() => {
    if (!draft) resetHeight();
  }, [draft]);

  useEffect(() => {
    if (composerFocusNonce > 0) textareaRef.current?.focus();
  }, [composerFocusNonce]);

  const send = useCallback(() => {
    if (sendMutation.isPending || sendPendingMutation.isPending || disabled || !me?.id) return;

    const text = draft.trim();
    const hasAttachments = attachments.length > 0;

    if (hasAttachments) {
      sendPendingMutation.mutate(
        {
          chatId,
          attachments,
          caption: text || undefined,
          clientTempId: crypto.randomUUID(),
          replyToId: replyToMessageId ?? undefined,
        },
        {
          onSuccess: () => {
            clearDraft(chatId);
            clearReply();
            resetHeight();
            textareaRef.current?.focus();
          },
        },
      );
      return;
    }

    if (!text) return;

    sendMutation.mutate(
      {
        chatId,
        text,
        clientTempId: crypto.randomUUID(),
        replyToId: replyToMessageId ?? undefined,
      },
      {
        onSuccess: () => {
          clearDraft(chatId);
          clearReply();
          resetHeight();
          textareaRef.current?.focus();
        },
      },
    );
  }, [
    attachments,
    chatId,
    clearDraft,
    clearReply,
    disabled,
    draft,
    me?.id,
    replyToMessageId,
    sendMutation,
    sendPendingMutation,
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

  const isRecording = voice.isRecording || voice.isProcessing;
  const isSending = sendMutation.isPending || sendPendingMutation.isPending;
  const isDisabled = disabled || !me?.id || isRecording || isSending;
  const hasText = draft.trim().length > 0;
  const hasAttachments = attachments.length > 0;
  const canSend = hasText || hasAttachments;

  const wrapPaddingBottom =
    composerPaddingBottom !== undefined
      ? `${composerPaddingBottom}px`
      : 'calc(10px + var(--m-safe-bottom))';

  return (
    <div
      className={`mobile-composer-wrap${isRecording ? ' mobile-composer-wrap--recording' : ''}`}
      style={{
        transform: keyboardLift > 0 ? `translateY(-${keyboardLift}px)` : undefined,
        paddingBottom: wrapPaddingBottom,
      }}
    >
      <ComposerErrorBanner chatId={chatId} />
      <AttachmentPicker chatId={chatId} disabled={isDisabled} />
      <div className={`mobile-composer-dock${hasReply ? ' mobile-composer-dock--reply' : ''}`}>
        <MobileComposerReplyPreview chatId={chatId} />
        <div className="mobile-composer">
        {isRecording ? (
          <MobileComposerVoiceControls
            hasText={canSend}
            hasAttachments={hasAttachments}
            onSend={send}
            elapsedMs={voice.elapsedMs}
            isRecording={voice.isRecording}
            isProcessing={voice.isProcessing}
            isBusy={voice.isBusy || isSending}
            onStartRecording={voice.startRecording}
            onCancelRecording={voice.cancelRecording}
            onFinishRecording={voice.finishRecording}
          />
        ) : (
          <>
            {hasAttachments ? (
              <div className="mobile-composer__attachments">
                <MobileComposerAttachmentPreview chatId={chatId} />
              </div>
            ) : null}
            <div className="mobile-composer__shell">
              <button
                type="button"
                className="mobile-composer__attach"
                aria-label="Прикрепить файл"
                disabled={isDisabled}
                onClick={() => setAttachmentPickerOpen(true)}
              >
                {hasAttachments ? (
                  <span className="mobile-composer__attach-badge" aria-hidden>
                    {attachments.length}
                  </span>
                ) : null}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path
                    d="M8 12.5l7.2-7.2a3 3 0 014.2 4.2l-8.4 8.4a4.5 4.5 0 01-6.4-6.4l9-9"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <div className="mobile-composer__field-wrap">
                <textarea
                  ref={textareaRef}
                  className="mobile-composer__input"
                  rows={1}
                  placeholder={hasAttachments ? 'Подпись' : 'Сообщение'}
                  value={draft}
                  onChange={(e) => setDraft(chatId, e.target.value)}
                  onInput={handleInput}
                  onKeyDown={handleKeyDown}
                  disabled={isDisabled}
                  aria-label={hasAttachments ? 'Подпись к медиа' : 'Текст сообщения'}
                />
              </div>
              <MobileComposerVoiceControls
                hasText={canSend}
                hasAttachments={hasAttachments}
                onSend={send}
                elapsedMs={voice.elapsedMs}
                isRecording={voice.isRecording}
                isProcessing={voice.isProcessing}
                isBusy={voice.isBusy || isSending}
                onStartRecording={voice.startRecording}
                onCancelRecording={voice.cancelRecording}
                onFinishRecording={voice.finishRecording}
              />
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
