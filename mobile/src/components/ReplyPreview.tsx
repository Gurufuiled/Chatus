import React from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import type { Message } from '../stores/types';

export type ReplyPreviewMode = 'composer' | 'bubble';

function getMediaLabel(message: Message): string {
  switch (message.msg_type) {
    case 'image':
      return message.content?.trim() ? `Фото: ${message.content.trim()}` : 'Фото';
    case 'voice':
      return 'Голосовое сообщение';
    case 'video_note':
      return 'Видеокружок';
    case 'file':
      return message.media?.[0]?.file_name?.trim() || 'Файл';
    default:
      return 'Сообщение';
  }
}

export function buildReplyPreviewText(message: Message | null | undefined): string {
  if (!message) return '';
  if (message.is_deleted) return 'Сообщение удалено';

  if (message.msg_type === 'text') {
    const text = message.content?.trim();
    return text?.length ? text : 'Пустое сообщение';
  }

  return getMediaLabel(message);
}

export function getReplyPreviewThumbnailUri(message: Message | null | undefined): string | null {
  if (!message || message.is_deleted) return null;

  if (message.msg_type === 'video_note') {
    const videoThumbnail = message.media?.[0]?.thumbnail_url?.trim();
    if (videoThumbnail) return videoThumbnail;
  }

  if (message.msg_type !== 'image') return null;

  const thumbnailUri = message.media?.[0]?.thumbnail_url?.trim();
  if (thumbnailUri) return thumbnailUri;

  const remoteUri = message.media?.[0]?.remote_url?.trim();
  return remoteUri || null;
}

type ReplyPreviewProps = {
  author: string;
  text: string;
  mode?: ReplyPreviewMode;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  authorColor?: string;
  thumbnailUri?: string | null;
  onPress?: () => void;
  onClose?: () => void;
};

export function ReplyPreview({
  author,
  text,
  mode = 'bubble',
  accentColor = '#F28C28',
  backgroundColor,
  textColor,
  authorColor,
  thumbnailUri,
  onPress,
  onClose,
}: ReplyPreviewProps) {
  const isComposer = mode === 'composer';
  const hasThumbnail = !!thumbnailUri?.trim();

  const handlePress = React.useCallback((event: GestureResponderEvent) => {
    event.stopPropagation?.();
    onPress?.();
  }, [onPress]);

  const handleClose = React.useCallback((event: GestureResponderEvent) => {
    event.stopPropagation?.();
    onClose?.();
  }, [onClose]);

  const content = (
    <>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      {hasThumbnail ? (
        <Image
          source={{ uri: thumbnailUri! }}
          style={[styles.thumbnail, isComposer ? styles.thumbnailComposer : styles.thumbnailBubble]}
        />
      ) : null}
      <View style={styles.content}>
        <Text
          style={[
            styles.author,
            isComposer && styles.authorComposer,
            authorColor ? { color: authorColor } : null,
          ]}
          numberOfLines={1}
        >
          {author}
        </Text>
        <Text
          style={[
            styles.text,
            isComposer && styles.textComposer,
            textColor ? { color: textColor } : null,
          ]}
          numberOfLines={1}
        >
          {text}
        </Text>
      </View>
      {onClose ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel reply"
          hitSlop={10}
          onPress={handleClose}
          style={styles.closeButton}
        >
          <Feather name="x" size={18} color="rgba(255,255,255,0.72)" />
        </Pressable>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open replied message"
        onPress={handlePress}
        style={({ pressed }) => [
          styles.root,
          isComposer ? styles.rootComposer : styles.rootBubble,
          backgroundColor ? { backgroundColor } : null,
          pressed && styles.rootPressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.root,
        isComposer ? styles.rootComposer : styles.rootBubble,
        backgroundColor ? { backgroundColor } : null,
      ]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    overflow: 'hidden',
  },
  rootPressed: {
    opacity: 0.9,
  },
  rootComposer: {
    backgroundColor: '#232528',
    minHeight: 50,
    borderRadius: 18,
  },
  rootBubble: {
    backgroundColor: '#6FA4FF',
    marginBottom: 8,
    borderRadius: 12,
    marginHorizontal: -2,
  },
  accent: {
    width: 3,
    alignSelf: 'stretch',
  },
  thumbnail: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginLeft: 10,
  },
  thumbnailBubble: {
    width: 38,
    height: 38,
    borderRadius: 10,
  },
  thumbnailComposer: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  content: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 0,
  },
  author: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: '#B85E1C',
  },
  authorComposer: {
    fontSize: 14,
    lineHeight: 17,
    color: '#FFFFFF',
  },
  text: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.86)',
  },
  textComposer: {
    fontSize: 13,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.88)',
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
});
