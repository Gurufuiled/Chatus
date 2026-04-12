import React, { useEffect, useMemo, useRef, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  Alert,
  GestureResponderEvent,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useVoicePlaybackForUri,
  useVoicePlayerControls,
} from '../../contexts/VoicePlayerContext';
import { buildUiWaveform } from '../../services/waveformUtils';
import { colors } from '../../theme/colors';
import {
  formatMediaDuration,
  formatRemainingPlaybackDuration,
} from '../../utils/mediaDuration';
import {
  ensureVideoThumbnailUri,
  getCachedVideoThumbnailUri,
} from '../../utils/videoThumbnail';
import type { GroupFileItem, GroupMediaItem, GroupVoiceItem } from './groupProfile.types';

type GroupMediaTabKey = 'media' | 'files' | 'voice';

type GroupProfileMediaContentProps = {
  activeTab: GroupMediaTabKey;
  mediaItems: GroupMediaItem[];
  fileItems: GroupFileItem[];
  voiceItems: GroupVoiceItem[];
  onOpenMedia: (index: number) => void;
  onOpenFile: (item: GroupFileItem) => void;
  onOpenVideoNote: (item: GroupVoiceItem) => void;
  onOpenActionMenu: (messageId: string, event: GestureResponderEvent) => void;
};

function buildVoicePreviewBars(waveform: number[]) {
  const base =
    waveform.length > 0
      ? buildUiWaveform(waveform, 28)
      : buildUiWaveform([0.22, 0.34, 0.58, 0.41, 0.27, 0.49, 0.31], 28);
  return base.map((value) => 4 + Math.pow(value, 1.15) * 16);
}

function useVideoPreviewUri(videoUri: string | null | undefined, preferredUri?: string | null) {
  const normalizedVideoUri = videoUri?.trim() ?? '';
  const normalizedPreferredUri = preferredUri?.trim() ?? '';
  const [generatedUri, setGeneratedUri] = useState(() =>
    normalizedPreferredUri ? '' : getCachedVideoThumbnailUri(normalizedVideoUri) ?? ''
  );

  useEffect(() => {
    let isMounted = true;

    if (normalizedPreferredUri || !normalizedVideoUri) {
      setGeneratedUri('');
      return () => {
        isMounted = false;
      };
    }

    const cached = getCachedVideoThumbnailUri(normalizedVideoUri);
    if (cached) {
      setGeneratedUri(cached);
      return () => {
        isMounted = false;
      };
    }

    void ensureVideoThumbnailUri(normalizedVideoUri)
      .then((nextUri) => {
        if (isMounted) setGeneratedUri(nextUri);
      })
      .catch(() => {
        if (isMounted) setGeneratedUri('');
      });

    return () => {
      isMounted = false;
    };
  }, [normalizedPreferredUri, normalizedVideoUri]);

  return normalizedPreferredUri || generatedUri;
}

const GroupFileRow = React.memo(function GroupFileRow({
  item,
  onOpenFile,
  onOpenMenu,
}: {
  item: GroupFileItem;
  onOpenFile: (item: GroupFileItem) => void;
  onOpenMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  return (
    <Pressable
      onPress={() => onOpenFile(item)}
      onLongPress={(event) => onOpenMenu(item.id, event)}
      delayLongPress={220}
      style={({ pressed }) => [styles.fileRow, pressed && styles.rowPressed]}
    >
      <View style={styles.fileBadge}>
        <Text style={styles.fileBadgeText}>{item.extension}</Text>
      </View>
      <View style={styles.fileTextWrap}>
        <Text style={styles.fileTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.fileSubtitle} numberOfLines={1}>
          {[item.size, item.date].filter(Boolean).join(' • ')}
        </Text>
      </View>
    </Pressable>
  );
});

const MediaTilePreview = React.memo(function MediaTilePreview({ item }: { item: GroupMediaItem }) {
  const generatedPreviewUri = useVideoPreviewUri(
    item.kind === 'video' ? item.uri : null,
    item.previewUri
  );
  const previewUri = item.kind === 'video' ? generatedPreviewUri : item.previewUri ?? item.uri;

  if (!previewUri) {
    return (
      <View style={[styles.mediaImage, styles.mediaVideoFallback]}>
        <Feather name="video" size={22} color="#FFFFFF" />
      </View>
    );
  }

  return <Image source={{ uri: previewUri }} style={styles.mediaImage} />;
});

const GroupVoiceRow = React.memo(function GroupVoiceRow({
  item,
  onOpenMenu,
}: {
  item: GroupVoiceItem;
  onOpenMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  const { play, pause } = useVoicePlayerControls();
  const { isCurrent, isPlaying, progress, remainingMs } = useVoicePlaybackForUri(
    item.uri,
    item.durationMs
  );
  const durationLabel = isCurrent && (isPlaying || progress > 0)
    ? formatRemainingPlaybackDuration(remainingMs)
    : formatMediaDuration(item.durationMs);
  const bars = useMemo(() => buildVoicePreviewBars(item.waveform), [item.waveform]);
  const suppressNextPressRef = useRef(false);

  const handlePlayPress = async () => {
    if (!item.uri) {
      Alert.alert(
        'Голосовое недоступно',
        'У этого сообщения пока нет ссылки для воспроизведения.'
      );
      return;
    }

    try {
      if (isPlaying) {
        await pause();
      } else {
        await play(item.uri);
      }
    } catch {
      Alert.alert('Не удалось воспроизвести', 'Попробуй ещё раз чуть позже.');
    }
  };

  return (
    <Pressable
      onPress={() => {
        if (suppressNextPressRef.current) {
          suppressNextPressRef.current = false;
          return;
        }
        void handlePlayPress();
      }}
      onLongPress={(event) => {
        suppressNextPressRef.current = true;
        onOpenMenu(item.id, event);
      }}
      delayLongPress={220}
      style={({ pressed }) => [styles.voiceRow, pressed && styles.rowPressed]}
    >
      {({ pressed }) => (
        <>
          <View
            style={[
          styles.voicePlayButton,
          isPlaying && styles.voicePlayButtonActive,
          pressed && styles.voicePlayButtonPressed,
            ]}
          >
            <Feather
              name={isPlaying ? 'pause' : 'play'}
              size={16}
              color="#FFFFFF"
              style={!isPlaying ? styles.voicePlayIcon : undefined}
            />
          </View>

          <View style={styles.voiceWaveWrap}>
            <View style={styles.voiceWaveTrack}>
              {bars.map((height, index) => {
                const isFilled = progress > 0 && index / bars.length <= progress;
                return (
                  <View
                    key={`${item.id}-${index}`}
                    style={[
                      styles.voiceBar,
                      {
                        height,
                        backgroundColor: isFilled ? colors.accent : 'rgba(77,141,255,0.24)',
                      },
                    ]}
                  />
                );
              })}
            </View>
            <View style={styles.voiceMetaRow}>
              <Text style={styles.voiceDuration}>{durationLabel}</Text>
              <Text style={styles.voiceDate}>{item.dateLabel}</Text>
            </View>
          </View>
        </>
      )}
    </Pressable>
  );
});

const GroupVideoNoteRow = React.memo(function GroupVideoNoteRow({
  item,
  onOpen,
  onOpenMenu,
}: {
  item: GroupVoiceItem;
  onOpen: (item: GroupVoiceItem) => void;
  onOpenMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  const previewUri = useVideoPreviewUri(item.uri, item.thumbnailUri);

  return (
    <Pressable
      onPress={() => onOpen(item)}
      onLongPress={(event) => onOpenMenu(item.id, event)}
      delayLongPress={220}
      style={({ pressed }) => [styles.voiceRow, pressed && styles.videoNoteRowPressed]}
    >
      <View style={styles.videoNoteThumbWrap}>
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={styles.videoNoteThumb} />
        ) : (
          <View style={styles.videoNoteThumbFallback}>
            <Feather name="video" size={18} color="#FFFFFF" />
          </View>
        )}
        <View style={styles.videoNoteThumbOverlay}>
          <Feather name="play" size={14} color="#FFFFFF" style={styles.voicePlayIcon} />
        </View>
      </View>

      <View style={styles.videoNoteTextWrap}>
        {item.title ? (
          <Text style={styles.videoNoteTitle} numberOfLines={1}>
            {item.title}
          </Text>
        ) : null}
        <View style={styles.voiceMetaRow}>
          <Text style={styles.voiceDuration}>{formatMediaDuration(item.durationMs)}</Text>
          <Text style={styles.voiceDate}>{item.dateLabel}</Text>
        </View>
      </View>
    </Pressable>
  );
});

export const GroupProfileMediaContent = React.memo(function GroupProfileMediaContent({
  activeTab,
  mediaItems,
  fileItems,
  voiceItems,
  onOpenMedia,
  onOpenFile,
  onOpenVideoNote,
  onOpenActionMenu,
}: GroupProfileMediaContentProps) {
  if (activeTab === 'media') {
    if (mediaItems.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Пока нет медиа</Text>
          <Text style={styles.emptySubtitle}>Фото и видео из группы появятся здесь.</Text>
        </View>
      );
    }

    return (
      <View style={styles.mediaGrid}>
        {mediaItems.map((item, index) => (
          <Pressable
            key={item.id}
            onPress={() => onOpenMedia(index)}
            onLongPress={(event) => onOpenActionMenu(item.id, event)}
            delayLongPress={220}
            style={({ pressed }) => [styles.mediaTile, pressed && styles.rowPressed]}
          >
            <MediaTilePreview item={item} />
            {item.kind === 'video' ? (
              <View style={styles.mediaPlayBadge}>
                <Feather name="play" size={14} color="#FFFFFF" style={styles.voicePlayIcon} />
              </View>
            ) : null}
            {item.durationMs ? (
              <View style={styles.mediaBadge}>
                <Text style={styles.mediaBadgeText}>{formatMediaDuration(item.durationMs)}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    );
  }

  if (activeTab === 'files') {
    if (fileItems.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Пока нет файлов</Text>
          <Text style={styles.emptySubtitle}>Файлы из этой группы будут отображаться здесь.</Text>
        </View>
      );
    }

    return (
      <View style={styles.stackSection}>
        {fileItems.map((item) => (
          <GroupFileRow
            key={item.id}
            item={item}
            onOpenFile={onOpenFile}
            onOpenMenu={onOpenActionMenu}
          />
        ))}
      </View>
    );
  }

  if (voiceItems.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Пока нет голосовых</Text>
        <Text style={styles.emptySubtitle}>Голосовые сообщения и видеосообщения группы будут здесь.</Text>
      </View>
    );
  }

  return (
    <View style={styles.stackSection}>
      {voiceItems.map((item) =>
        item.kind === 'video_note' ? (
          <GroupVideoNoteRow
            key={item.id}
            item={item}
            onOpen={onOpenVideoNote}
            onOpenMenu={onOpenActionMenu}
          />
        ) : (
          <GroupVoiceRow key={item.id} item={item} onOpenMenu={onOpenActionMenu} />
        )
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  mediaGrid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -3,
  },
  mediaTile: {
    width: '33.3333%',
    aspectRatio: 1,
    padding: 3,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: '#DDE7F7',
  },
  mediaVideoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
  mediaPlayBadge: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.62)',
  },
  mediaBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
  },
  mediaBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stackSection: {
    marginTop: 14,
    gap: 10,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 74,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  fileBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77,141,255,0.12)',
    marginRight: 12,
  },
  fileBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
  },
  fileTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  fileTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  fileSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#8A93A3',
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  voicePlayButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginRight: 12,
  },
  voicePlayButtonActive: {
    backgroundColor: '#4C84E8',
  },
  voicePlayButtonPressed: {
    opacity: 0.84,
  },
  voicePlayIcon: {
    marginLeft: 2,
  },
  voiceWaveWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    justifyContent: 'center',
  },
  voiceWaveTrack: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  voiceBar: {
    width: 3,
    borderRadius: 999,
  },
  voiceMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  voiceDuration: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
  },
  voiceDate: {
    fontSize: 13,
    color: '#8A93A3',
  },
  videoNoteRowPressed: {
    opacity: 0.86,
  },
  videoNoteThumbWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: colors.buttonBackground,
  },
  videoNoteThumb: {
    width: '100%',
    height: '100%',
  },
  videoNoteThumbFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.textSecondary,
  },
  videoNoteThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.24)',
  },
  videoNoteTextWrap: {
    flex: 1,
  },
  videoNoteTitle: {
    marginBottom: 5,
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  emptyCard: {
    marginTop: 14,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#8A93A3',
    textAlign: 'center',
  },
  rowPressed: {
    opacity: 0.86,
  },
});
