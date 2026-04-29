import React, { useCallback, useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { bubbleRadius, colors, typography } from '../theme/colors';
import { MessageReactionInline, type InlineReactionItem } from './MessageReactionInline';
import { MessageTimeStatus } from './MessageTimeStatus';

export interface FileBubbleProps {
  fileName: string;
  fileSize?: number;
  uri?: string;
  isMe: boolean;
  caption?: string | null;
  time?: string;
  status?: string;
  header?: React.ReactNode;
  bubbleMeColor?: string;
  outgoingTextColor?: string;
  outgoingMetaColor?: string;
  outgoingAccentColor?: string;
  inlineReactions?: InlineReactionItem[];
  allowMessageReactions?: boolean;
  onToggleInlineReaction?: (emoji: string) => void;
  reactionAccentColor?: string;
  incomingBubbleBackground?: string;
  incomingBubbleBorderColor?: string;
  incomingFileNameColor?: string;
  incomingSecondaryTextColor?: string;
  incomingCaptionColor?: string;
}

function formatFileSize(bytes?: number): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kiloBytes = bytes / 1024;
    return `${kiloBytes.toFixed(kiloBytes >= 10 ? 0 : 1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    const megaBytes = bytes / (1024 * 1024);
    return `${megaBytes.toFixed(megaBytes >= 10 ? 0 : 1)} MB`;
  }

  const gigaBytes = bytes / (1024 * 1024 * 1024);
  return `${gigaBytes.toFixed(gigaBytes >= 10 ? 0 : 1)} GB`;
}

function looksLikeFileUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('/uploads/') || value.startsWith('file://');
}

function normalizeCaption(
  caption: string | null | undefined,
  fileName: string,
  uri?: string,
): string | null {
  const trimmed = caption?.trim();
  if (!trimmed) return null;
  if (trimmed === fileName.trim()) return null;
  if (uri?.trim() && trimmed === uri.trim()) return null;
  if (looksLikeFileUrl(trimmed)) return null;
  return trimmed;
}

export function FileBubble({
  fileName,
  fileSize,
  uri,
  isMe,
  caption,
  time,
  status,
  header,
  bubbleMeColor,
  outgoingTextColor,
  outgoingMetaColor,
  outgoingAccentColor,
  inlineReactions,
  allowMessageReactions,
  onToggleInlineReaction,
  reactionAccentColor,
  incomingBubbleBackground,
  incomingBubbleBorderColor,
  incomingFileNameColor,
  incomingSecondaryTextColor,
  incomingCaptionColor,
}: FileBubbleProps) {
  const sizeText = formatFileSize(fileSize);
  const fileCaption = useMemo(
    () => normalizeCaption(caption, fileName, uri),
    [caption, fileName, uri],
  );

  const handlePress = useCallback(() => {
    if (!uri?.trim()) return;

    Linking.openURL(uri).catch(() => {
      // Ignore: some files may not be openable on the device yet.
    });
  }, [uri]);

  const hasMetaRow = !!sizeText || !!time;

  return (
    <View
      style={[
        styles.container,
        isMe ? styles.bubbleMe : styles.bubbleOther,
        !isMe && incomingBubbleBackground
          ? {
              backgroundColor: incomingBubbleBackground,
              borderColor: incomingBubbleBorderColor ?? colors.bubbleOtherBorder,
            }
          : null,
        isMe && bubbleMeColor ? { backgroundColor: bubbleMeColor } : null,
      ]}
    >
      {header}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={uri?.trim() ? 'Open file' : 'File'}
        disabled={!uri?.trim()}
        hitSlop={8}
        onPress={handlePress}
        style={({ pressed }) => [styles.card, pressed && uri?.trim() ? styles.cardPressed : null]}
      >
        <View
          style={[
            styles.iconBadge,
            isMe ? styles.iconBadgeMe : styles.iconBadgeOther,
            isMe && outgoingAccentColor ? { backgroundColor: outgoingAccentColor } : null,
          ]}
        >
          <View style={styles.documentIcon}>
            <View
              style={[
                styles.documentFold,
                isMe ? styles.documentFoldMe : styles.documentFoldOther,
                isMe && outgoingAccentColor ? { borderBottomColor: outgoingAccentColor } : null,
              ]}
            />
            <View style={styles.documentLine} />
            <View style={[styles.documentLine, styles.documentLineShort]} />
          </View>
        </View>

        <View style={styles.infoColumn}>
          <Text
            style={[
              styles.fileName,
              isMe ? styles.fileNameMe : styles.fileNameOther,
              isMe && outgoingTextColor ? { color: outgoingTextColor } : null,
              !isMe && incomingFileNameColor ? { color: incomingFileNameColor } : null,
            ]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {fileName || 'Unnamed file'}
          </Text>

          {hasMetaRow ? (
            <View style={styles.metaRow}>
              <Text
                style={[
                  styles.fileSize,
                  isMe ? styles.fileSizeMe : styles.fileSizeOther,
                  isMe && outgoingMetaColor ? { color: outgoingMetaColor } : null,
                  !isMe && incomingSecondaryTextColor ? { color: incomingSecondaryTextColor } : null,
                ]}
              >
                {sizeText ?? ' '}
              </Text>
              {time ? (
                <MessageTimeStatus
                  time={time}
                  status={status ?? 'sent'}
                  isMe={isMe}
                  compact
                  timeColor={isMe ? outgoingMetaColor : incomingSecondaryTextColor}
                  iconColor={isMe ? outgoingMetaColor : incomingSecondaryTextColor}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>

      {fileCaption ? (
        <Text
          style={[
            styles.caption,
            isMe ? styles.captionMe : styles.captionOther,
            isMe && outgoingTextColor ? { color: outgoingTextColor } : null,
            !isMe && incomingCaptionColor ? { color: incomingCaptionColor } : null,
          ]}
        >
          {fileCaption}
        </Text>
      ) : null}

      {inlineReactions?.length ? (
        <MessageReactionInline
          reactions={inlineReactions}
          isMe={isMe}
          allowReactions={!!allowMessageReactions && !!onToggleInlineReaction}
          onToggle={(emoji) => onToggleInlineReaction?.(emoji)}
          accentColor={reactionAccentColor}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  bubbleMe: {
    backgroundColor: colors.bubbleMe,
    ...bubbleRadius.mine,
  },
  bubbleOther: {
    backgroundColor: colors.bubbleOther,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.bubbleOtherBorder,
    ...bubbleRadius.other,
  },
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    maxWidth: '100%',
  },
  cardPressed: {
    opacity: 0.86,
  },
  iconBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  iconBadgeMe: {
    backgroundColor: '#2E73F3',
  },
  iconBadgeOther: {
    backgroundColor: 'rgba(77, 141, 255, 0.14)',
  },
  documentIcon: {
    width: 22,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 4,
    paddingTop: 9,
    position: 'relative',
    overflow: 'hidden',
  },
  documentFold: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
  },
  documentFoldMe: {
    borderBottomColor: colors.link,
  },
  documentFoldOther: {
    borderBottomColor: colors.accent,
  },
  documentLine: {
    height: 2,
    borderRadius: 999,
    backgroundColor: '#D4DEEA',
    marginBottom: 3,
  },
  documentLineShort: {
    width: '62%',
  },
  infoColumn: {
    flex: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  fileName: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '600',
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  fileNameMe: {
    color: '#FFFFFF',
  },
  fileNameOther: {
    color: colors.textPrimary,
  },
  metaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    minWidth: 0,
    width: '100%',
  },
  fileSize: {
    fontSize: typography.timeStatus,
    lineHeight: 15,
    flexShrink: 1,
    minWidth: 0,
  },
  fileSizeMe: {
    color: colors.textSecondaryMuted,
  },
  fileSizeOther: {
    color: colors.textSecondary,
  },
  caption: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 19,
    flexShrink: 1,
  },
  captionMe: {
    color: '#FFFFFF',
  },
  captionOther: {
    color: colors.textPrimary,
  },
});
