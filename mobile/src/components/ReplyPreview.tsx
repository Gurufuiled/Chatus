import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import type { Message } from '../stores/types';

export type ReplyPreviewMode = 'composer' | 'bubble';

function getMediaLabel(message: Message): string {
  switch (message.msg_type) {
    case 'image':
      return message.content?.trim() ? `Photo: ${message.content.trim()}` : 'Photo';
    case 'voice':
      return 'Voice message';
    case 'video_note':
      return 'Video note';
    case 'file':
      return message.media?.[0]?.file_name?.trim() || 'File';
    default:
      return 'Message';
  }
}

export function buildReplyPreviewText(message: Message | null | undefined): string {
  if (!message) return '';
  if (message.is_deleted) return 'Deleted message';

  if (message.msg_type === 'text') {
    const text = message.content?.trim();
    return text?.length ? text : 'Empty message';
  }

  return getMediaLabel(message);
}

type ReplyPreviewProps = {
  author: string;
  text: string;
  mode?: ReplyPreviewMode;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  authorColor?: string;
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
  onClose,
}: ReplyPreviewProps) {
  const isComposer = mode === 'composer';

  return (
    <View
      style={[
        styles.root,
        isComposer ? styles.rootComposer : styles.rootBubble,
        backgroundColor ? { backgroundColor } : null,
      ]}
    >
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
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
          onPress={onClose}
          style={styles.closeButton}
        >
          <Feather name="x" size={18} color="rgba(255,255,255,0.72)" />
        </Pressable>
      ) : null}
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
