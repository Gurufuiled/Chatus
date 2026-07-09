import { useCallback, useEffect, useRef } from 'react';
import { useComposerStore, EMPTY_PENDING_ATTACHMENTS } from '@/stores/composerStore';
import { usePublishChannelPostMutation } from '@/queries/channel.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { MobileComposerAttachmentPreview } from './MobileComposerAttachmentPreview';
import { ComposerErrorBanner } from '@/features/conversation/ComposerErrorBanner';
import { ACCEPT as COMPOSER_ACCEPT } from '@/features/conversation/AttachmentPicker';
import { MobileComposerVoiceControls } from './MobileComposerVoiceControls';
import { useChannelPostVoiceRecorder } from '../hooks/useChannelPostVoiceRecorder';
import { buildMediaPayload, inferMsgTypeFromUpload, uploadFile } from '@/services/mediaService';
import { isStageableAlbumMedia } from '@/queries/media.queries';

interface MobileChannelPostComposerProps {
  channelId: string;
  disabled?: boolean;
  keyboardLift?: number;
  composerPaddingBottom?: number;
}

export function MobileChannelPostComposer({
  channelId,
  disabled = false,
  keyboardLift = 0,
  composerPaddingBottom,
}: MobileChannelPostComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draft = useComposerStore((s) => s.drafts[channelId] ?? '');
  const pendingAttachments = useComposerStore((s) => s.pendingAttachments[channelId]);
  const attachments = pendingAttachments ?? EMPTY_PENDING_ATTACHMENTS;
  const setDraft = useComposerStore((s) => s.setDraft);
  const clearDraft = useComposerStore((s) => s.clearDraft);
  const setAttachmentPickerOpen = useComposerStore((s) => s.setAttachmentPickerOpen);
  const isAttachmentPickerOpen = useComposerStore((s) => s.isAttachmentPickerOpen);
  const addPendingAttachment = useComposerStore((s) => s.addPendingAttachment);
  const clearPendingAttachments = useComposerStore((s) => s.clearPendingAttachments);
  const setComposerError = useComposerStore((s) => s.setComposerError);
  const publishPost = usePublishChannelPostMutation();
  const { data: me } = useMeQuery();

  const voiceDisabled = disabled || !me?.id || publishPost.isPending;
  const voice = useChannelPostVoiceRecorder(channelId, voiceDisabled, publishPost.mutateAsync);

  const resetHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
  };

  useEffect(() => {
    if (!draft) resetHeight();
  }, [draft]);

  useEffect(() => {
    if (isAttachmentPickerOpen && !disabled) {
      fileInputRef.current?.click();
      setAttachmentPickerOpen(false);
    }
  }, [disabled, isAttachmentPickerOpen, setAttachmentPickerOpen]);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (isStageableAlbumMedia(file)) {
        addPendingAttachment(channelId, file, false);
      } else {
        addPendingAttachment(channelId, file, true);
      }
    }
  };

  const publishMedia = useCallback(
    async (caption: string) => {
      const staged = attachments.slice(0, 10);
      if (staged.length === 0) return;

      const albumItems = staged.filter(
        (item) => !item.sendAsFile && isStageableAlbumMedia(item.file),
      );
      const fileItems = staged.filter(
        (item) => item.sendAsFile || !isStageableAlbumMedia(item.file),
      );

      if (albumItems.length > 0 && fileItems.length > 0) {
        throw new Error('Отправьте альбом или файл отдельно, не вместе');
      }

      if (albumItems.length > 1) {
        const uploaded = await Promise.all(
          albumItems.map(async (attachment) => {
            const result = await uploadFile(attachment.file);
            const msgType = inferMsgTypeFromUpload(attachment.file, result);
            return {
              media_type: msgType,
              ...buildMediaPayload(result),
            };
          }),
        );
        const firstType = uploaded[0]?.media_type === 'video' ? 'video' : 'image';
        await publishPost.mutateAsync({
          channelId,
          content: caption || undefined,
          msgType: firstType,
          media: uploaded,
        });
        clearPendingAttachments(channelId);
        return;
      }

      const attachment = staged[0];
      const uploaded = await uploadFile(attachment.file);
      const msgType = attachment.sendAsFile
        ? 'file'
        : inferMsgTypeFromUpload(attachment.file, uploaded);

      await publishPost.mutateAsync({
        channelId,
        content:
          caption ||
          (msgType === 'file' ? attachment.file.name : undefined),
        msgType,
        media: {
          media_type: msgType,
          ...buildMediaPayload(uploaded),
        },
      });
      clearPendingAttachments(channelId);
    },
    [attachments, channelId, clearPendingAttachments, publishPost],
  );

  const send = useCallback(async () => {
    if (publishPost.isPending || disabled || !me?.id) return;

    const text = draft.trim();
    const hasAttachments = attachments.length > 0;

    try {
      if (hasAttachments) {
        await publishMedia(text);
        clearDraft(channelId);
        resetHeight();
        textareaRef.current?.focus();
        return;
      }

      if (!text) return;

      await publishPost.mutateAsync({ channelId, content: text });
      clearDraft(channelId);
      resetHeight();
      textareaRef.current?.focus();
    } catch (err) {
      setComposerError(
        channelId,
        err instanceof Error ? err.message : 'Не удалось опубликовать',
      );
    }
  }, [
    attachments.length,
    channelId,
    clearDraft,
    disabled,
    draft,
    me?.id,
    publishMedia,
    publishPost,
    setComposerError,
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
      void send();
    }
  };

  const isRecording = voice.isRecording || voice.isProcessing;
  const isSending = publishPost.isPending;
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
      <ComposerErrorBanner chatId={channelId} />
      <input
        ref={fileInputRef}
        type="file"
        accept={COMPOSER_ACCEPT}
        multiple
        className="mobile-channel-post-composer__file-input"
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="mobile-composer-dock">
        <div className="mobile-composer">
          {isRecording ? (
            <MobileComposerVoiceControls
              hasText={canSend}
              hasAttachments={hasAttachments}
              onSend={() => void send()}
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
                  <MobileComposerAttachmentPreview chatId={channelId} />
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
                    placeholder={hasAttachments ? 'Подпись' : 'Публикация'}
                    value={draft}
                    onChange={(e) => setDraft(channelId, e.target.value)}
                    onInput={handleInput}
                    onKeyDown={handleKeyDown}
                    disabled={isDisabled}
                    aria-label={hasAttachments ? 'Подпись к публикации' : 'Текст публикации'}
                  />
                </div>
                <MobileComposerVoiceControls
                  hasText={canSend}
                  hasAttachments={hasAttachments}
                  onSend={() => void send()}
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
