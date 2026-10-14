import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  Alert,
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MediaThumbPressable } from '../MediaThumbPressable';
import { Image } from 'expo-image';
import {
  useVoicePlaybackForUri,
  useVoicePlayerControls,
} from '../../contexts/VoicePlayerContext';
import { useTheme } from '../../contexts/ThemeContext';
import { VoiceWaveform } from '../VoiceWaveform';
import type { ThemeColors } from '../../theme/palettes';
import { withAlpha } from '../../theme/stylePrimitives';
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

function createGroupProfileMediaStyles(c: ThemeColors) {
  return StyleSheet.create({
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
      backgroundColor: c.placeholderBg,
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
      backgroundColor: c.inputBackgroundSolid,
    },
    fileBadge: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(c.accent, 0.12),
      marginRight: 12,
    },
    fileBadgeText: {
      fontSize: 12,
      fontWeight: '800',
      color: c.accent,
    },
    fileTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    fileTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textPrimary,
    },
    fileSubtitle: {
      marginTop: 4,
      fontSize: 13,
      color: c.textSecondary,
    },
    voiceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 72,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 22,
      backgroundColor: c.inputBackgroundSolid,
    },
    voicePlayButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
      marginRight: 12,
    },
    voicePlayButtonActive: {
      backgroundColor: c.link,
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
      height: 28,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 2,
      overflow: 'visible',
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
      color: c.textPrimary,
    },
    voiceDate: {
      fontSize: 13,
      color: c.textSecondary,
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
      backgroundColor: c.buttonBackground,
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
      backgroundColor: c.iconMuted,
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
      color: c.textPrimary,
    },
    emptyCard: {
      marginTop: 14,
      borderRadius: 24,
      backgroundColor: c.inputBackgroundSolid,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 48,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: c.textPrimary,
    },
    emptySubtitle: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
      color: c.textSecondary,
      textAlign: 'center',
    },
    rowPressed: {
      opacity: 0.86,
    },
  });
}

type GroupProfileMediaStyles = ReturnType<typeof createGroupProfileMediaStyles>;

const GroupProfileMediaStylesContext = createContext<GroupProfileMediaStyles | null>(null);

function useGroupProfileMediaStyles(): GroupProfileMediaStyles {
  const ctx = useContext(GroupProfileMediaStylesContext);
  if (!ctx) {
    throw new Error('Group profile media styles used outside GroupProfileMediaContent');
  }
  return ctx;
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
  const styles = useGroupProfileMediaStyles();
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
  const styles = useGroupProfileMediaStyles();
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

  return (
    <Image
      source={{ uri: previewUri }}
      style={styles.mediaImage}
      contentFit="cover"
      cachePolicy="disk"
    />
  );
});

const GroupVoiceRow = React.memo(function GroupVoiceRow({
  item,
  onOpenMenu,
}: {
  item: GroupVoiceItem;
  onOpenMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  const styles = useGroupProfileMediaStyles();
  const { colors: themeColors } = useTheme();
  const { play, pause } = useVoicePlayerControls();
  const { isCurrent, isPlaying, progress, remainingMs } = useVoicePlaybackForUri(
    item.uri,
    item.durationMs
  );
  const durationLabel = isCurrent && (isPlaying || progress > 0)
    ? formatRemainingPlaybackDuration(remainingMs)
    : formatMediaDuration(item.durationMs);
  const suppressNextPressRef = useRef(false);

  const handlePlayPress = () => {
    if (!item.uri) {
      Alert.alert(
        'Голосовое недоступно',
        'У этого сообщения пока нет ссылки для воспроизведения.'
      );
      return;
    }

    try {
      if (isPlaying) {
        void pause().catch(() => {
          Alert.alert('Не удалось воспроизвести', 'Попробуй ещё раз чуть позже.');
        });
      } else {
        void play(item.uri).catch(() => {
          Alert.alert('Не удалось воспроизвести', 'Попробуй ещё раз чуть позже.');
        });
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
            <VoiceWaveform
              waveform={item.waveform}
              seed={item.uri ?? item.id}
              durationMs={item.durationMs}
              progress={isCurrent ? progress : 0}
              playedColor={themeColors.accent}
              unplayedColor={withAlpha(themeColors.accent, 0.3)}
              disabled
            />
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
  const styles = useGroupProfileMediaStyles();
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
          <Image
            source={{ uri: previewUri }}
            style={styles.videoNoteThumb}
            contentFit="cover"
            cachePolicy="disk"
          />
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
  const { colors: c } = useTheme();
  const styles = useMemo(() => createGroupProfileMediaStyles(c), [c]);

  const body = (() => {
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
            <MediaThumbPressable
              thumbId={item.id}
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
            </MediaThumbPressable>
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
          <Text style={styles.emptySubtitle}>
            Голосовые сообщения и видеосообщения группы будут здесь.
          </Text>
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
  })();

  return (
    <GroupProfileMediaStylesContext.Provider value={styles}>{body}</GroupProfileMediaStylesContext.Provider>
  );
});
