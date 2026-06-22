import React from 'react';
import { Dimensions, Text, View } from 'react-native';
import { FileBubble } from '../../components/FileBubble';
import { ImageBubble } from '../../components/ImageBubble';
import { MessageTextBubbleBody } from '../../components/MessageTextBubbleBody';
import { MessageTimeStatus } from '../../components/MessageTimeStatus';
import { ReplyPreview } from '../../components/ReplyPreview';
import { VideoBubble } from '../../components/VideoBubble';
import { PendingVideoNoteBubble } from '../../components/TelegramPendingMediaBubble';
import { VoiceBubble } from '../../components/VoiceBubble';
import { TelegramMediaAlbumBubble } from '../../components/TelegramMediaAlbumBubble';
import type { Message } from '../../stores/types';
import type { ThemeColors } from '../../theme/palettes';
import { formatTime } from './composer';
import { getTelegramReplyPreviewText, getTelegramReplyThumbnailUri } from './messageRow';
import type { TelegramChatStyles } from './telegramChatStyles';
import type { TelegramMessageRow } from './types';
import {
  MeBubbleChrome,
  shouldUseDarkDefaultOutgoingBubbleGradient,
} from '../../components/OutgoingBubbleViewportGradient';
import { DEFAULT_CHAT_THEME_ID, getChatTheme, type ChatTheme } from '../../theme/chatThemes';
import type { ResolvedColorScheme } from '../../theme/palettes';

const SCREEN_WIDTH = Dimensions.get('window').width;

export type TelegramChatMenuPreviewProps = {
  message: Message;
  forcedWidth?: number;
  /** Высота окна превью в оверлее (обрезка длинных постов / альбомов). */
  previewMaxHeight?: number;
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

function menuMediaClamp(
  forcedWidth: number | undefined,
  previewMaxHeight: number | undefined,
): { maxWidth: number; maxHeight: number } | undefined {
  if (!previewMaxHeight || previewMaxHeight < 80) return undefined;
  const maxWidth = Math.max(120, (forcedWidth ?? SCREEN_WIDTH * 0.72) - 8);
  return {
    maxWidth,
    maxHeight: Math.max(96, previewMaxHeight - 16),
  };
}

export function TelegramChatMenuPreviewBody({
  message,
  forcedWidth,
  previewMaxHeight,
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
  if (!row || (String(row.messageId) !== message.id && row.id !== message.id)) return <View />;
  const fixedWidthStyle = forcedWidth ? { width: forcedWidth, maxWidth: forcedWidth } : undefined;
  const isMe = row.outgoing;
  const resolvedScheme = resolvedSchemeProp ?? 'light';
  const chatTheme =
    chatThemeProp ?? getChatTheme(DEFAULT_CHAT_THEME_ID, resolvedScheme);
  const usePreviewOutgoingGradient =
    isMe && shouldUseDarkDefaultOutgoingBubbleGradient(chatTheme, resolvedScheme);
  const meBubbleFill =
    isMe && usePreviewOutgoingGradient ? '#00000000' : chatTheme.bubbleMe;
  const outgoingBubbleTextColor = isMe ? chatTheme.bubbleMeText : '#FFFFFF';
  const outgoingBubbleMetaColor = isMe ? chatTheme.bubbleMeMeta : colors.textSecondary;
  const outgoingBubbleAccentColor = isMe ? chatTheme.bubbleMeAccent : colors.accent;
  const outgoingMessageTextStyle = isMe
    ? [styles.messageText, { color: chatTheme.bubbleMeText }]
    : styles.messageText;
  const outgoingBubbleSurfaceStyle = isMe
    ? { backgroundColor: chatTheme.bubbleMe, borderBottomRightRadius: 6 }
    : null;
  const outgoingVideoNoteMetaColor = outgoingBubbleMetaColor;
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
        accentColor={isMe ? chatTheme.replyAccentMe : colors.accent}
        backgroundColor={
          isMe
            ? resolvedScheme === 'dark'
              ? 'rgba(255,255,255,0.14)'
              : chatTheme.replyBubbleMe
            : colors.inputBackground
        }
        textColor={isMe ? chatTheme.replyTextMe : colors.textSecondary}
        authorColor={isMe ? chatTheme.replyAuthorMe : colors.accent}
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
  const textBubbleColorStyle = isMe ? outgoingBubbleSurfaceStyle : styles.bubbleOther;
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
            <Text style={outgoingMessageTextStyle}>Голосовое</Text>
            <MessageTimeStatus
              time={formatTime(row.dateMs)}
              status={row.status}
              isMe={isMe}
              compact
              timeColor={isMe ? outgoingBubbleMetaColor : colors.textSecondary}
              iconColor={isMe ? outgoingBubbleMetaColor : colors.textSecondary}
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
          outgoingTextColor={outgoingBubbleTextColor}
          outgoingMetaColor={outgoingBubbleMetaColor}
          outgoingAccentColor={outgoingBubbleAccentColor}
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
            <Text style={outgoingMessageTextStyle}>Видеосообщение</Text>
            <MessageTimeStatus
              time={formatTime(row.dateMs)}
              status={row.status}
              isMe={isMe}
              compact
              timeColor={isMe ? outgoingBubbleMetaColor : colors.textSecondary}
              iconColor={isMe ? outgoingBubbleMetaColor : colors.textSecondary}
            />
          </View>
        </View>
      );
    }
    return (
      <View style={fixedWidthStyle}>
        <PendingVideoNoteBubble
          isMe={isMe}
          thumbnailUri={row.thumbnailUri ?? undefined}
          durationMs={row.durationMs ?? 0}
          time={formatTime(row.dateMs)}
          status={row.status}
          header={bubbleHeader}
          outgoingMetaColor={outgoingVideoNoteMetaColor}
        />
      </View>
    );
  }

  const mediaClamp = menuMediaClamp(forcedWidth, previewMaxHeight);

  if (row.kind === 'album' && row.albumMedia && row.albumMedia.length > 0) {
    return (
      <View style={fixedWidthStyle}>
        <TelegramMediaAlbumBubble
          items={row.albumMedia}
          isMe={isMe}
          caption={row.text}
          time={formatTime(row.dateMs)}
          status={row.status}
          styles={styles}
          chatTheme={chatTheme}
          viewportOutgoingGradient={usePreviewOutgoingGradient}
          scrollTick={scrollTick}
          incomingCaptionBg={colors.bubbleOther}
          incomingCaptionBorder={colors.bubbleOtherBorder}
          incomingCaptionText={colors.textPrimary}
          incomingCaptionMeta={colors.textSecondary}
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
          bubbleMeColor={isMe ? meBubbleFill : colors.bubbleMe}
          outgoingTextColor={outgoingBubbleTextColor}
          incomingBubbleBackground={colors.bubbleOther}
          incomingBubbleBorderColor={colors.bubbleOtherBorder}
          incomingCaptionTextColor={colors.textPrimary}
          mediaClamp={mediaClamp}
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
          bubbleMeColor={isMe ? meBubbleFill : colors.bubbleMe}
          outgoingTextColor={outgoingBubbleTextColor}
          incomingBubbleBackground={colors.bubbleOther}
          incomingBubbleBorderColor={colors.bubbleOtherBorder}
          incomingCaptionTextColor={colors.textPrimary}
          mediaClamp={mediaClamp}
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
          bubbleMeColor={isMe ? meBubbleFill : colors.bubbleMe}
          outgoingTextColor={outgoingBubbleTextColor}
          outgoingMetaColor={outgoingBubbleMetaColor}
          outgoingAccentColor={outgoingBubbleAccentColor}
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
      <MessageTextBubbleBody
        text={row.text ?? ''}
        textStyle={outgoingMessageTextStyle}
        rowStyle={styles.bubbleContentRow}
        hasViews={!!viewCountFormatted}
        meta={
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {viewCountFormatted ? (
              <Text
                style={[styles.viewCountText, isMe ? { color: chatTheme.bubbleMeMeta } : null]}
              >{` 👁 ${viewCountFormatted}`}</Text>
            ) : null}
            <MessageTimeStatus
              time={formatTime(row.dateMs)}
              status={row.status}
              isMe={isMe}
              compact
              timeColor={isMe ? outgoingBubbleMetaColor : colors.textSecondary}
              iconColor={isMe ? outgoingBubbleMetaColor : colors.textSecondary}
            />
          </View>
        }
      />
    </>
  );

  if (isMe) {
    return (
      <View style={fixedWidthStyle}>
        <MeBubbleChrome
          active={usePreviewOutgoingGradient}
          scrollTick={scrollTick}
          fillColor={chatTheme.bubbleMe}
          style={[
            styles.bubble,
            { borderBottomRightRadius: 6 },
            !usePreviewOutgoingGradient ? outgoingBubbleSurfaceStyle : null,
          ]}
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
