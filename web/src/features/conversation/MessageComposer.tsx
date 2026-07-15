import { useCallback, useEffect, useRef } from 'react';
import { IconButton } from '@/components/buttons/IconButton';
import { useComposerStore, EMPTY_PENDING_ATTACHMENTS } from '@/stores/composerStore';
import { useSendMessageMutation } from '@/queries/messages.queries';
import { useSendPendingAttachmentsMutation } from '@/queries/media.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { StickerPicker } from './StickerPicker';
import { AttachmentPicker } from './AttachmentPicker';
import { ComposerVoiceControls } from './ComposerVoiceControls';
import { ComposerReplyPreview } from './ComposerReplyPreview';
import { ComposerErrorBanner } from './ComposerErrorBanner';
import { ComposerAttachmentPreview } from './ComposerAttachmentPreview';
import { useVoiceRecorder } from './useVoiceRecorder';

interface MessageComposerProps {
  chatId: string;
  disabled?: boolean;
}

export function MessageComposer({ chatId, disabled = false }: MessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draft = useComposerStore((s) => s.drafts[chatId] ?? '');
  const pendingAttachments = useComposerStore((s) => s.pendingAttachments[chatId]);
  const attachments = pendingAttachments ?? EMPTY_PENDING_ATTACHMENTS;
  const setDraft = useComposerStore((s) => s.setDraft);
  const clearDraft = useComposerStore((s) => s.clearDraft);
  const clearReply = useComposerStore((s) => s.clearReply);
  const replyToMessageId = useComposerStore((s) =>
    s.replyChatId === chatId ? s.replyToMessageId : null,
  );
  const isStickerPickerOpen = useComposerStore((s) => s.isStickerPickerOpen);
  const setStickerPickerOpen = useComposerStore((s) => s.setStickerPickerOpen);
  const setAttachmentPickerOpen = useComposerStore((s) => s.setAttachmentPickerOpen);
  const requestComposerFocus = useComposerStore((s) => s.requestComposerFocus);
  const composerFocusNonce = useComposerStore((s) => s.composerFocusNonce);
  const sendMutation = useSendMessageMutation();
  const sendPendingMutation = useSendPendingAttachmentsMutation();
  const { data: me } = useMeQuery();

  const voiceDisabled = disabled || !me?.id;
  const voice = useVoiceRecorder(chatId, voiceDisabled);

  const resetTextareaHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
  };

  useEffect(() => {
    if (!draft) resetTextareaHeight();
  }, [draft]);

  useEffect(() => {
    if (composerFocusNonce > 0) {
      textareaRef.current?.focus();
    }
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
          replyToId: replyToMessageId,
          clientTempId: crypto.randomUUID(),
        },
        {
          onSuccess: () => {
            clearDraft(chatId);
            clearReply();
            resetTextareaHeight();
            requestComposerFocus();
          },
        },
      );
      return;
    }

    if (!text) return;

    const clientTempId = crypto.randomUUID();
    sendMutation.mutate(
      {
        chatId,
        text,
        replyToId: replyToMessageId,
        clientTempId,
      },
      {
        onSuccess: () => {
          clearDraft(chatId);
          clearReply();
          resetTextareaHeight();
          requestComposerFocus();
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
    requestComposerFocus,
    sendMutation,
    sendPendingMutation,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(chatId, e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const isRecording = voice.isRecording || voice.isProcessing;
  const isSending = sendMutation.isPending || sendPendingMutation.isPending;
  const isDisabled = disabled || !me?.id || isRecording || isSending;
  const hasText = draft.trim().length > 0;
  const hasAttachments = attachments.length > 0;
  const canSend = hasText || hasAttachments;

  return (
    <div className="message-composer-wrap">
      <ComposerErrorBanner chatId={chatId} />
      <StickerPicker chatId={chatId} disabled={isDisabled} />
      <AttachmentPicker chatId={chatId} disabled={isDisabled} />
      <footer className={`message-composer${isRecording ? ' message-composer--recording' : ''}`}>
        <div
          className={`message-composer__panel${replyToMessageId ? ' message-composer__panel--with-reply' : ''}${hasAttachments && !isRecording ? ' message-composer__panel--with-attachments' : ''}${isRecording ? ' message-composer__panel--recording' : ''}`}
        >
          {!isRecording ? <ComposerReplyPreview chatId={chatId} /> : null}
          {!isRecording ? (
            <>
              <ComposerAttachmentPreview chatId={chatId} />
              <div className="message-composer__row">
                <IconButton
                  label="Стикеры"
                  title="Стикеры"
                  className={`message-composer__icon${isStickerPickerOpen ? ' message-composer__icon--active' : ''}`}
                  disabled={isDisabled}
                  onClick={() => setStickerPickerOpen(!isStickerPickerOpen)}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path
                      d="M8.5 9.5h.01M15.5 9.5h.01M8.5 14.5c1.2 1.4 2.4 2 3.5 2s2.3-.6 3.5-2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </IconButton>
                <textarea
                  ref={textareaRef}
                  className="message-composer__input"
                  placeholder={hasAttachments ? 'Подпись' : 'Сообщение'}
                  aria-label={hasAttachments ? 'Подпись к медиа' : 'Сообщение'}
                  rows={1}
                  value={draft}
                  disabled={isDisabled}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                />
                <IconButton
                  label="Прикрепить файл"
                  title="Прикрепить файл"
                  className="message-composer__icon"
                  disabled={isDisabled}
                  onClick={() => setAttachmentPickerOpen(true)}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                    <path
                      d="M8 12.5l7.2-7.2a3 3 0 014.2 4.2l-8.4 8.4a4.5 4.5 0 01-6.4-6.4l9-9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </IconButton>
              </div>
            </>
          ) : null}
        </div>
        <ComposerVoiceControls
          hasText={canSend}
          onSendText={send}
          inPanel={isRecording}
          elapsedMs={voice.elapsedMs}
          isRecording={voice.isRecording}
          isProcessing={voice.isProcessing}
          isBusy={voice.isBusy || isSending}
          onStartRecording={voice.startRecording}
          onCancelRecording={voice.cancelRecording}
          onFinishRecording={voice.finishRecording}
        />
      </footer>
    </div>
  );
}
