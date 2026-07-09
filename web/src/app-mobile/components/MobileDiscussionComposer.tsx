import { useCallback, useEffect, useRef } from 'react';
import { useComposerStore, EMPTY_PENDING_ATTACHMENTS } from '@/stores/composerStore';
import { useSendDiscussionMessageMutation } from '@/queries/channel.queries';
import { useMeQuery } from '@/queries/auth.queries';
import { MobileComposerAttachmentPreview } from './MobileComposerAttachmentPreview';
import { ComposerErrorBanner } from '@/features/conversation/ComposerErrorBanner';
import { ACCEPT as COMPOSER_ACCEPT } from '@/features/conversation/AttachmentPicker';
import { MobileComposerVoiceControls } from './MobileComposerVoiceControls';
import { MobileDiscussionReplyPreview } from './MobileDiscussionReplyPreview';
import { useDiscussionVoiceRecorder } from '../hooks/useDiscussionVoiceRecorder';
import { buildMediaPayload, inferMsgTypeFromUpload, uploadFile } from '@/services/mediaService';
import {
  ATTACHMENT_UPLOAD_CONCURRENCY,
  isStageableAlbumMedia,
  mapPool,
} from '@/queries/media.queries';
import type { MappedMessage } from '@/types/message';

interface MobileDiscussionComposerProps {
  channelId: string;
  postId: string;
  composerId: string;
  messages: MappedMessage[];
  disabled?: boolean;
  disableVoice?: boolean;
  disableMedia?: boolean;
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
  disableVoice = false,
  disableMedia = false,
  keyboardLift = 0,
  composerPaddingBottom,
  onMessageSent,
}: MobileDiscussionComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draft = useComposerStore((s) => s.drafts[composerId] ?? '');
  const pendingAttachments = useComposerStore((s) => s.pendingAttachments[composerId]);
  const attachments = pendingAttachments ?? EMPTY_PENDING_ATTACHMENTS;
  const setDraft = useComposerStore((s) => s.setDraft);
  const clearDraft = useComposerStore((s) => s.clearDraft);
  const setAttachmentPickerOpen = useComposerStore((s) => s.setAttachmentPickerOpen);
  const isAttachmentPickerOpen = useComposerStore((s) => s.isAttachmentPickerOpen);
  const addPendingAttachment = useComposerStore((s) => s.addPendingAttachment);
  const clearPendingAttachments = useComposerStore((s) => s.clearPendingAttachments);
  const removePendingAttachmentsByIds = useComposerStore((s) => s.removePendingAttachmentsByIds);
  const replyToMessageId = useComposerStore((s) =>
    s.replyChatId === composerId ? s.replyToMessageId : null,
  );
  const clearReply = useComposerStore((s) => s.clearReply);
  const setComposerError = useComposerStore((s) => s.setComposerError);
  const composerFocusNonce = useComposerStore((s) => s.composerFocusNonce);
  const sendMessage = useSendDiscussionMessageMutation();
  const { data: me } = useMeQuery();
  const hasReply = !!replyToMessageId;
  const sendingLockRef = useRef(false);

  const voiceDisabled =
    disabled || disableVoice || !me?.id || sendMessage.isPending;
  const voice = useDiscussionVoiceRecorder(
    composerId,
    channelId,
    postId,
    voiceDisabled,
    sendMessage.mutateAsync,
    onMessageSent,
  );

  useEffect(() => {
    if (composerFocusNonce > 0) textareaRef.current?.focus();
  }, [composerFocusNonce]);

  useEffect(() => {
    if (!draft) {
      const el = textareaRef.current;
      if (el) el.style.height = 'auto';
    }
  }, [draft]);

  useEffect(() => {
    if (isAttachmentPickerOpen && !disabled && !disableMedia) {
      fileInputRef.current?.click();
      setAttachmentPickerOpen(false);
    } else if (isAttachmentPickerOpen && disableMedia) {
      setAttachmentPickerOpen(false);
      setComposerError(composerId, 'Медиа-комментарии отключены в этом канале');
    }
  }, [
    composerId,
    disableMedia,
    disabled,
    isAttachmentPickerOpen,
    setAttachmentPickerOpen,
    setComposerError,
  ]);

  const resetHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files?.length || disableMedia) return;
    for (const file of Array.from(files)) {
      if (isStageableAlbumMedia(file)) {
        addPendingAttachment(composerId, file, false);
      } else {
        addPendingAttachment(composerId, file, true);
      }
    }
  };

  const sendAttachments = useCallback(
    async (caption: string) => {
      const staged = attachments.slice(0, 10);
      if (staged.length === 0) return;

      if (disableMedia) {
        throw new Error('Медиа-комментарии отключены в этом канале');
      }

      const albumItems = staged.filter(
        (item) => !item.sendAsFile && isStageableAlbumMedia(item.file),
      );
      const fileItems = staged.filter(
        (item) => item.sendAsFile || !isStageableAlbumMedia(item.file),
      );

      if (albumItems.length > 0 && fileItems.length > 0) {
        throw new Error('Отправьте альбом или файл отдельно, не вместе');
      }

      const queue =
        albumItems.length > 0
          ? albumItems.map((item) => ({
              id: item.id,
              file: item.file,
              sendAsFile: false as boolean,
            }))
          : fileItems.map((item) => ({
              id: item.id,
              file: item.file,
              sendAsFile: true as boolean,
            }));

      const uploaded = await mapPool(
        queue,
        ATTACHMENT_UPLOAD_CONCURRENCY,
        async (attachment) => {
          const result = await uploadFile(attachment.file);
          const msgType = attachment.sendAsFile
            ? 'file'
            : inferMsgTypeFromUpload(attachment.file, result);
          return {
            id: attachment.id,
            fileName: attachment.file.name,
            msgType,
            media: buildMediaPayload(result),
          };
        },
      );

      const sentIds: string[] = [];
      try {
        let first = true;
        for (const item of uploaded) {
          await sendMessage.mutateAsync({
            channelId,
            postId,
            content: first
              ? caption || (item.msgType === 'file' ? item.fileName : undefined)
              : item.msgType === 'file'
                ? item.fileName
                : undefined,
            msgType: item.msgType,
            replyToId: first ? (replyToMessageId ?? undefined) : undefined,
            media: item.media,
          });
          sentIds.push(item.id);
          first = false;
        }
        clearPendingAttachments(composerId);
      } catch (err) {
        if (sentIds.length > 0) {
          removePendingAttachmentsByIds(composerId, sentIds);
        }
        if (sentIds.length > 0 && sentIds.length < uploaded.length) {
          const remaining = uploaded.length - sentIds.length;
          const base = err instanceof Error ? err.message : 'Не удалось отправить';
          throw new Error(
            `${base}. Отправлено ${sentIds.length} из ${uploaded.length}, осталось ${remaining}`,
          );
        }
        throw err;
      }
    },
    [
      attachments,
      channelId,
      clearPendingAttachments,
      composerId,
      disableMedia,
      postId,
      removePendingAttachmentsByIds,
      replyToMessageId,
      sendMessage,
    ],
  );

  const send = useCallback(async () => {
    if (sendingLockRef.current || sendMessage.isPending || disabled || !me?.id) return;

    const text = draft.trim();
    const hasAttachments = attachments.length > 0;
    if (!hasAttachments && !text) return;

    sendingLockRef.current = true;
    try {
      if (hasAttachments) {
        await sendAttachments(text);
        clearDraft(composerId);
        clearReply();
        resetHeight();
        textareaRef.current?.focus();
        onMessageSent?.();
        return;
      }

      await sendMessage.mutateAsync({
        channelId,
        postId,
        content: text,
        msgType: 'text',
        replyToId: replyToMessageId ?? undefined,
      });
      clearDraft(composerId);
      clearReply();
      resetHeight();
      textareaRef.current?.focus();
      onMessageSent?.();
    } catch (err) {
      setComposerError(
        composerId,
        err instanceof Error ? err.message : 'Не удалось отправить',
      );
    } finally {
      sendingLockRef.current = false;
    }
  }, [
    attachments.length,
    channelId,
    clearDraft,
    clearReply,
    composerId,
    disabled,
    draft,
    me?.id,
    onMessageSent,
    postId,
    replyToMessageId,
    sendAttachments,
    sendMessage,
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
  const isSending = sendMessage.isPending;
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
      <ComposerErrorBanner chatId={composerId} />
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
      <div className={`mobile-composer-dock${hasReply ? ' mobile-composer-dock--reply' : ''}`}>
        <MobileDiscussionReplyPreview composerId={composerId} messages={messages} />
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
                  <MobileComposerAttachmentPreview chatId={composerId} />
                </div>
              ) : null}
              <div className="mobile-composer__shell">
                <button
                  type="button"
                  className="mobile-composer__attach"
                  aria-label="Прикрепить файл"
                  disabled={isDisabled || disableMedia}
                  onClick={() => {
                    if (disableMedia) {
                      setComposerError(
                        composerId,
                        'Медиа-комментарии отключены в этом канале',
                      );
                      return;
                    }
                    setAttachmentPickerOpen(true);
                  }}
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
                    placeholder={hasAttachments ? 'Подпись' : 'Комментарий'}
                    value={draft}
                    onChange={(e) => setDraft(composerId, e.target.value)}
                    onInput={handleInput}
                    onKeyDown={handleKeyDown}
                    disabled={isDisabled}
                    aria-label={hasAttachments ? 'Подпись к медиа' : 'Текст комментария'}
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
                  onStartRecording={
                    disableVoice
                      ? () => {
                          setComposerError(
                            composerId,
                            'Голосовые комментарии отключены в этом канале',
                          );
                        }
                      : voice.startRecording
                  }
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
