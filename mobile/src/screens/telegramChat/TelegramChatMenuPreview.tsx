import React from 'react';
import { Text, View } from 'react-native';
import { FileBubble } from '../../components/FileBubble';
import { ImageBubble } from '../../components/ImageBubble';
import { MessageTimeStatus } from '../../components/MessageTimeStatus';
import { ReplyPreview } from '../../components/ReplyPreview';
import { VideoBubble } from '../../components/VideoBubble';
import { VideoNoteBubble } from '../../components/VideoNoteBubble';
import { VoiceBubble } from '../../components/VoiceBubble';
import type { Message } from '../../stores/types';
import type { ThemeColors } from '../../theme/palettes';
import { withAlpha } from '../../theme/stylePrimitives';
import { formatTime } from './composer';
import { getTelegramReplyPreviewText, getTelegramReplyThumbnailUri } from './messageRow';
import type { TelegramChatStyles } from './telegramChatStyles';
import type { TelegramMessageRow } from './types';
import {
  MeBubbleChrome,
  shouldUseDarkDefaultOutgoingBubbleGradient,
} from '../../components/OutgoingBubbleViewportGradient';
import type { ChatTheme } from '../../theme/chatThemes';
import type { ResolvedColorScheme } from '../../theme/palettes';

export type TelegramChatMenuPreviewProps = {
  message: Message;
  forcedWidth?: number;
  row: TelegramMessageRow | undefined;
  messageById: Map<number, TelegramMessageRow>;
  colors: ThemeColors;
  styles: TelegramChatStyles;
  headerTitle: string;
  isGroupChat: boolean;
  chatTheme?: ChatTheme;
  resolvedScheme?: ResolvedColorScheme;
  scrollTick?: number;
};

export function TelegramChatMenuPreviewBody({
  message,
  forcedWidth,
  row,
  messageById,
  colors,
  styles,
  headerTitle,
  isGroupChat,
  chatTheme: chatThemeProp,
  resolvedScheme: resolvedSchemeProp,
  scrollTick = 0,
}: TelegramChatMenuPreviewProps) {
  if (!row || row.id !== message.id) return <View />;
  const fixedWidthStyle = forcedWidth ? { width: forcedWidth, maxWidth: forcedWidth } : undefined;
  const isMe = row.outgoing;
  const usePreviewOutgoingGradient =
    isMe &&
    chatThemeProp != null &&
    resolvedSchemeProp != null &&
    shouldUseDarkDefaultOutgoingBubbleGradient(chatThemeProp, resolvedSchemeProp);
  const meBubbleFill =
    isMe && usePreviewOutgoingGradient ? '#00000000' : colors.bubbleMe;
  const outgoingVideoNoteMetaColor =
    isMe && usePreviewOutgoingGradient && chatThemeProp != null
      ? chatThemeProp.bubbleMeMeta
      : colors.textSecondaryMuted;
  const outgoingVideoNoteAccentColor =
    isMe && usePreviewOutgoingGradient && chatThemeProp != null
      ? chatThemeProp.bubbleMeAccent
      : colors.accent;
  const replyTarget =
    row.replyToMessageId != null ? messageById.get(row.replyToMessageId) ?? null : null;
  const replySnippet =
    row.replyToMessageId != null ? (
      <ReplyPreview
        author={
          replyTarget
            ? replyTarget.outgoing
              ? 'Вы'
              : isGroupChat && replyTarget.senderName
                ? replyTarget.senderName
                : headerTitle
            : 'Исходное сообщение'
        }
        text={replyTarget ? getTelegramReplyPreviewText(replyTarget) : 'Исходное сообщение недоступно'}
        accentColor={isMe ? withAlpha('#FFFFFF', 0.9) : colors.accent}
        backgroundColor={isMe ? withAlpha('#FFFFFF', 0.12) : colors.inputBackground}
        textColor={isMe ? withAlpha('#FFFFFF', 0.82) : colors.textSecondary}
        authorColor={isMe ? '#FFFFFF' : colors.accent}
        thumbnailUri={getTelegramReplyThumbnailUri(replyTarget)}
      />
    ) : null;
  const senderNameNode =
    !isMe && row.senderName && isGroupChat ? (
      <Text style={styles.senderNameText} numberOfLines={1}>
        {row.senderName}
      </Text>
    ) : null;
  const bubbleHeader =
    senderNameNode || replySnippet ? (
      <>
        {senderNameNode}
        {replySnippet}
      </>
    ) : null;
  const textBubbleColorStyle = isMe
    ? (usePreviewOutgoingGradient ? undefined : styles.bubbleMe)
    : styles.bubbleOther;
  const viewCountFormatted =
    row.viewCount != null
      ? row.viewCount >= 1_000_000
        ? `${(row.viewCount / 1_000_000).toFixed(1)}M`
        : row.viewCount >= 1_000
          ? `${(row.viewCount / 1_000).toFixed(1)}K`
          : String(row.viewCount)
      : null;

  if (row.kind === 'voice') {
    if (!row.voiceUri) {
      return (
        <View style={fixedWidthStyle}>
          <View style={[styles.bubble, textBubbleColorStyle]}>
            {bubbleHeader}
            <Text style={[styles.messageText, isMe && styles.messageTextMe]}>Голосовое</Text>
            <MessageTimeStatus
              time={formatTime(row.dateMs)}
              status={row.status}
              isMe={isMe}
              compact
              timeColor={isMe ? colors.textSecondaryMuted : colors.textSecondary}
              iconColor={isMe ? colors.textSecondaryMuted : colors.textSecondary}
            />
          </View>
        </View>
      );
    }
    return (
      <View style={fixedWidthStyle}>
        <VoiceBubble
          uri={row.voiceUri}
          waveform={row.waveform ?? []}
          durationMs={row.durationMs ?? 0}
          isMe={isMe}
          time={formatTime(row.dateMs)}
          status={row.status}
          header={bubbleHeader}
          bubbleMeColor={meBubbleFill}
          outgoingTextColor="#FFFFFF"
          outgoingMetaColor={colors.textSecondaryMuted}
          outgoingAccentColor={colors.accent}
          incomingBubbleBackground={colors.bubbleOther}
          incomingBubbleBorderColor={colors.bubbleOtherBorder}
          incomingDurationColor={colors.textSecondary}
        />
      </View>
    );
  }

  if (row.kind === 'video_note') {
    if (!row.mediaUri) {
      return (
        <View style={fixedWidthStyle}>
          <View style={[styles.bubble, textBubbleColorStyle]}>
            {bubbleHeader}
            <Text style={[styles.messageText, isMe && styles.messageTextMe]}>Видеосообщение</Text>
            <MessageTimeStatus
              time={formatTime(row.dateMs)}
              status={row.status}
              isMe={isMe}
              compact
              timeColor={isMe ? colors.textSecondaryMuted : colors.textSecondary}
              iconColor={isMe ? colors.textSecondaryMuted : colors.textSecondary}
            />
          </View>
        </View>
      );
    }
    return (
      <View style={fixedWidthStyle}>
        <VideoNoteBubble
          messageId={row.id}
          uri={row.mediaUri}
          thumbnailUri={row.thumbnailUri ?? undefined}
          durationMs={row.durationMs ?? 0}
          isMe={isMe}
          time={formatTime(row.dateMs)}
          status={row.status}
          header={bubbleHeader}
          outgoingMetaColor={outgoingVideoNoteMetaColor}
          outgoingAccentColor={outgoingVideoNoteAccentColor}
          viewportOutgoingGradient={
            isMe && usePreviewOutgoingGradient && row.replyToMessageId == null
          }
          scrollTick={scrollTick}
          registerPlaybackState={false}
        />
      </View>
    );
  }

  if (row.kind === 'image' && row.mediaUri) {
    return (
      <View style={fixedWidthStyle}>
        <ImageBubble
          uri={row.mediaUri}
          isMe={isMe}
          width={row.width}
          height={row.height}
          caption={row.text}
          time={formatTime(row.dateMs)}
          status={row.status}
          header={bubbleHeader}
          bubbleMeColor={colors.bubbleMe}
          outgoingTextColor="#FFFFFF"
          incomingBubbleBackground={colors.bubbleOther}
          incomingBubbleBorderColor={colors.bubbleOtherBorder}
          incomingCaptionTextColor={colors.textPrimary}
        />
      </View>
    );
  }

  if (row.kind === 'video' && row.mediaUri) {
    return (
      <View style={fixedWidthStyle}>
        <VideoBubble
          uri={row.mediaUri}
          thumbnailUri={row.thumbnailUri ?? undefined}
          isMe={isMe}
          width={row.width}
          height={row.height}
          durationMs={row.durationMs ?? 0}
          caption={row.text}
          time={formatTime(row.dateMs)}
          status={row.status}
          header={bubbleHeader}
          bubbleMeColor={colors.bubbleMe}
          outgoingTextColor="#FFFFFF"
          incomingBubbleBackground={colors.bubbleOther}
          incomingBubbleBorderColor={colors.bubbleOtherBorder}
          incomingCaptionTextColor={colors.textPrimary}
        />
      </View>
    );
  }

  if (row.kind === 'file') {
    return (
      <View style={[styles.fileBubbleWrap, fixedWidthStyle]}>
        <FileBubble
          fileName={row.fileName ?? 'File'}
          fileSize={row.fileSize}
          uri={row.mediaUri ?? undefined}
          isMe={isMe}
          caption={row.text}
          time={formatTime(row.dateMs)}
          status={row.status}
          header={bubbleHeader}
          bubbleMeColor={colors.bubbleMe}
          outgoingTextColor="#FFFFFF"
          outgoingMetaColor={colors.textSecondaryMuted}
          outgoingAccentColor="#FFFFFF"
          incomingBubbleBackground={colors.bubbleOther}
          incomingBubbleBorderColor={colors.bubbleOtherBorder}
          incomingFileNameColor={colors.textPrimary}
          incomingSecondaryTextColor={colors.textSecondary}
          incomingCaptionColor={colors.textPrimary}
        />
      </View>
    );
  }

  const textBubbleBody = (
    <>
      {bubbleHeader}
      <View style={styles.bubbleContentRow}>
        <Text style={[styles.messageText, isMe && styles.messageTextMe]}>
          {row.text || ' '}
          {viewCountFormatted ? (
            <Text style={[styles.viewCountText, isMe && styles.viewCountTextMe]}>{` 👁 ${viewCountFormatted}`}</Text>
          ) : null}
          <Text style={{ fontSize: 12, color: 'transparent' }}>
            {'\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'}
          </Text>
        </Text>
        <View style={{ position: 'absolute', bottom: -2, right: 0 }}>
          <MessageTimeStatus
            time={formatTime(row.dateMs)}
            status={row.status}
            isMe={isMe}
            compact
            timeColor={isMe ? colors.textSecondaryMuted : colors.textSecondary}
            iconColor={isMe ? colors.textSecondaryMuted : colors.textSecondary}
          />
        </View>
      </View>
    </>
  );

  if (isMe && usePreviewOutgoingGradient) {
    return (
      <View style={fixedWidthStyle}>
        <MeBubbleChrome
          active
          scrollTick={scrollTick}
          fillColor={chatThemeProp!.bubbleMe}
          style={[styles.bubble, { borderBottomRightRadius: 6 }]}
        >
          {textBubbleBody}
        </MeBubbleChrome>
      </View>
    );
  }

  return (
    <View style={fixedWidthStyle}>
      <View style={[styles.bubble, textBubbleColorStyle]}>
        {textBubbleBody}
      </View>
    </View>
  );
}
