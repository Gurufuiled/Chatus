import React from 'react';
import Feather from '@expo/vector-icons/Feather';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../contexts/ThemeContext';
import { formatMediaDuration } from '../utils/mediaDuration';
import { MessageTimeStatus } from './MessageTimeStatus';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MAX_VIDEO_WIDTH = Math.min(SCREEN_WIDTH * 0.68, 300);
const MAX_VIDEO_HEIGHT = Math.min(Dimensions.get('window').height * 0.48, 360);
const DEFAULT_VIDEO_SIZE = {
  width: Math.min(MAX_VIDEO_WIDTH, 240),
  height: Math.min(MAX_VIDEO_HEIGHT, 300),
};
const VIDEO_NOTE_SIZE = Math.min(SCREEN_WIDTH * 0.58, 228);

type CommonProps = {
  isMe: boolean;
  thumbnailUri?: string | null;
  durationMs?: number;
  time?: string;
  status?: string;
  header?: React.ReactNode;
  outgoingMetaColor?: string;
  isDownloading?: boolean;
};

type PendingVideoProps = CommonProps & {
  width?: number;
  height?: number;
  caption?: string;
  mediaClamp?: { maxWidth: number; maxHeight: number };
};

function computeDisplaySize(
  naturalWidth?: number,
  naturalHeight?: number,
  mediaClamp?: { maxWidth: number; maxHeight: number },
) {
  const maxWidth = mediaClamp?.maxWidth ?? MAX_VIDEO_WIDTH;
  const maxHeight = mediaClamp?.maxHeight ?? MAX_VIDEO_HEIGHT;
  if (!naturalWidth || !naturalHeight) {
    return {
      width: Math.min(maxWidth, DEFAULT_VIDEO_SIZE.width),
      height: Math.min(maxHeight, DEFAULT_VIDEO_SIZE.height),
    };
  }

  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
  return {
    width: Math.max(120, Math.round(naturalWidth * scale)),
    height: Math.max(120, Math.round(naturalHeight * scale)),
  };
}

export function PendingVideoBubble({
  isMe,
  thumbnailUri,
  width,
  height,
  durationMs = 0,
  caption,
  time,
  status,
  header,
  outgoingMetaColor,
  mediaClamp,
  isDownloading = false,
}: PendingVideoProps) {
  const { colors } = useTheme();
  const size = computeDisplaySize(width, height, mediaClamp);
  const metaColor = isMe ? outgoingMetaColor : 'rgba(255,255,255,0.9)';

  return (
    <View
      style={[
        styles.videoRoot,
        size,
        { backgroundColor: isMe ? colors.bubbleMe : colors.bubbleOther },
      ]}
    >
      {thumbnailUri ? (
        <Image source={{ uri: thumbnailUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
      <View style={styles.scrim} />
      {header ? <View style={styles.headerWrap}>{header}</View> : null}
      <View style={styles.centerBadge}>
        {isDownloading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Feather name="download" size={22} color="#FFFFFF" />
        )}
      </View>
      {durationMs > 0 ? (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatMediaDuration(durationMs)}</Text>
        </View>
      ) : null}
      {caption ? <Text style={styles.captionText} numberOfLines={2}>{caption}</Text> : null}
      {time ? (
        <View style={styles.timeWrap}>
          <MessageTimeStatus
            time={time}
            status={status ?? 'sent'}
            isMe={isMe}
            compact
            timeColor={metaColor}
            iconColor={metaColor}
          />
        </View>
      ) : null}
    </View>
  );
}

export function PendingVideoNoteBubble({
  isMe,
  thumbnailUri,
  durationMs = 0,
  time,
  status,
  header,
  outgoingMetaColor,
  isDownloading = false,
}: CommonProps) {
  const { colors } = useTheme();
  const metaColor = isMe ? outgoingMetaColor : 'rgba(255,255,255,0.9)';

  return (
    <View style={styles.videoNoteOuter}>
      {header ? <View style={styles.videoNoteHeader}>{header}</View> : null}
      <View
        style={[
          styles.videoNoteCircle,
          { backgroundColor: isMe ? colors.bubbleMe : colors.bubbleOther },
        ]}
      >
        {thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
        <View style={styles.scrim} />
        <View style={styles.centerBadge}>
          {isDownloading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather name="download" size={20} color="#FFFFFF" />
          )}
        </View>
        {durationMs > 0 ? (
          <View style={styles.videoNoteDuration}>
            <Text style={styles.durationText}>{formatMediaDuration(durationMs)}</Text>
          </View>
        ) : null}
      </View>
      {time ? (
        <View style={styles.videoNoteTime}>
          <MessageTimeStatus
            time={time}
            status={status ?? 'sent'}
            isMe={isMe}
            compact
            timeColor={metaColor}
            iconColor={metaColor}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  videoRoot: {
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  headerWrap: {
    position: 'absolute',
    top: 8,
    left: 10,
    right: 10,
    zIndex: 2,
  },
  centerBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  playIcon: {
    marginLeft: 2,
  },
  durationBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  captionText: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 32,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  timeWrap: {
    position: 'absolute',
    right: 8,
    bottom: 7,
  },
  videoNoteOuter: {
    alignItems: 'center',
  },
  videoNoteHeader: {
    alignSelf: 'stretch',
    marginBottom: 6,
  },
  videoNoteCircle: {
    width: VIDEO_NOTE_SIZE,
    height: VIDEO_NOTE_SIZE,
    borderRadius: VIDEO_NOTE_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoNoteDuration: {
    position: 'absolute',
    left: 16,
    bottom: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  videoNoteTime: {
    marginTop: 4,
    alignSelf: 'flex-end',
  },
});
