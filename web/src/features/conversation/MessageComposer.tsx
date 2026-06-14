import { useCallback, useEffect, useRef } from 'react';
import { IconButton } from '@/components/buttons/IconButton';
import { useComposerStore } from '@/stores/composerStore';
import { useSendMessageMutation } from '@/queries/messages.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { StickerPicker } from './StickerPicker';
import { AttachmentPicker } from './AttachmentPicker';
import { VoiceRecorderButton } from './VoiceRecorderButton';
import { ComposerReplyPreview } from './ComposerReplyPreview';
import { ComposerErrorBanner } from './ComposerErrorBanner';

interface MessageComposerProps {
  chatId: string;
  disabled?: boolean;
}

export function MessageComposer({ chatId, disabled = false }: MessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draft = useComposerStore((s) => s.drafts[chatId] ?? '');
  const setDraft = useComposerStore((s) => s.setDraft);
  const clearDraft = useComposerStore((s) => s.clearDraft);
  const clearReply = useComposerStore((s) => s.clearReply);
  const replyToMessageId = useComposerStore((s) =>
    s.replyChatId === chatId ? s.replyToMessageId : null,
  );
  const isStickerPickerOpen = useComposerStore((s) => s.isStickerPickerOpen);
  const setStickerPickerOpen = useComposerStore((s) => s.setStickerPickerOpen);
  const setAttachmentPickerOpen = useComposerStore((s) => s.setAttachmentPickerOpen);
  const voiceRecordingState = useComposerStore((s) => s.voiceRecordingState);
  const requestComposerFocus = useComposerStore((s) => s.requestComposerFocus);
  const composerFocusNonce = useComposerStore((s) => s.composerFocusNonce);
  const sendMutation = useSendMessageMutation();
  const { data: me } = useMeQuery();

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
    const text = draft.trim();
    if (!text || sendMutation.isPending || disabled || !me?.id) return;

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
    chatId,
    clearDraft,
    clearReply,
    disabled,
    draft,
    me?.id,
    replyToMessageId,
    requestComposerFocus,
    sendMutation,
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

  const isRecording = voiceRecordingState === 'recording' || voiceRecordingState === 'processing';
  const isDisabled = disabled || sendMutation.isPending || !me?.id || isRecording;

  return (
    <div className="message-composer-wrap">
      <ComposerErrorBanner chatId={chatId} />
      <ComposerReplyPreview chatId={chatId} />
      <StickerPicker chatId={chatId} disabled={isDisabled} />
      <AttachmentPicker chatId={chatId} disabled={isDisabled} />
      <footer className="message-composer">
        <div className="message-composer__panel">
          <IconButton
            label="Стикеры"
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
            placeholder="Сообщение"
            aria-label="Сообщение"
            rows={1}
            value={draft}
            disabled={isDisabled}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
          />
          <IconButton
            label="Прикрепить файл"
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
        <VoiceRecorderButton chatId={chatId} disabled={disabled || sendMutation.isPending || !me?.id} />
      </footer>
    </div>
  );
}
