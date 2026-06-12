import React, { useEffect, useMemo, useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  Alert,
  GestureResponderEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import {
  useVoicePlaybackForUri,
  useVoicePlayerControls,
} from '../contexts/VoicePlayerContext';
import { useTheme } from '../contexts/ThemeContext';
import { buildVoiceProfileBarHeights } from '../utils/voiceProfileWaveform';
import { withAlpha } from '../theme/stylePrimitives';
import {
  createChatProfileMediaSectionStyles,
} from './chatProfileMediaSection.styles';
import {
  formatMediaDuration,
  formatRemainingPlaybackDuration,
} from '../utils/mediaDuration';
import {
  ensureVideoThumbnailUri,
  getCachedVideoThumbnailUri,
} from '../utils/videoThumbnail';
import { usePeerFirstResolvedUri } from './peerFirstMedia';

export type ProfileTabKey = 'media' | 'files' | 'voice' | 'links';

export type MediaTile = {
  id: string;
  kind: 'image' | 'video';
  uri: string;
  previewUri?: string;
  durationMs?: number;
  /** Текстовая подпись к медиа (пост канала). При наличии в вьювере появляется кнопка показа текста. */
  caption?: string;
};

export type FileItem = {
  id: string;
  title: string;
  subtitle: string;
  uri: string | null;
  extension: string;
};

export type VoiceItem = {
  id: string;
  kind: 'voice' | 'video_note';
  uri: string | null;
  thumbnailUri?: string;
  title?: string;
  durationMs: number;
  waveform: number[];
  dateLabel: string;
};

export type LinkItem = {
  id: string;
  title: string;
  subtitle: string;
  uri: string;
};

type ChatProfileMediaSectionProps = {
  activeTab: ProfileTabKey;
  mediaItems: MediaTile[];
  fileItems: FileItem[];
  voiceItems: VoiceItem[];
  linkItems: LinkItem[];
  onChangeTab: (tab: ProfileTabKey) => void;
  onOpenMedia: (index: number) => void;
  onOpenVideoNote: (item: VoiceItem) => void;
  onOpenActionMenu: (messageId: string, event: GestureResponderEvent) => void;
  /** LineSync line id (chat id) — peer-first thumbnails in the media grid. */
  peerFirstLineId?: string | null;
};

const TAB_LABELS: Record<ProfileTabKey, string> = {
  media: 'Медиа',
  files: 'Файлы',
  voice: 'Голосовые',
  links: 'Ссылки',
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

type ProfileTabsBarProps = {
  activeTab: ProfileTabKey;
  tabCounts: Record<ProfileTabKey, number>;
  onChangeTab: (tab: ProfileTabKey) => void;
};

const ProfileTabsBar = React.memo(function ProfileTabsBar({
  activeTab,
  tabCounts,
  onChangeTab,
}: ProfileTabsBarProps) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(
    () => createChatProfileMediaSectionStyles(themeColors),
    [themeColors],
  );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabsRow}
    >
      {(Object.keys(TAB_LABELS) as ProfileTabKey[]).map((tabKey) => {
        const isActive = activeTab === tabKey;
        return (
          <Pressable
            key={tabKey}
            onPress={() => onChangeTab(tabKey)}
            style={({ pressed }) => [
              styles.tabButton,
              isActive && styles.tabButtonActive,
              pressed && styles.tabButtonPressed,
            ]}
          >
            <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
              {TAB_LABELS[tabKey]}
            </Text>
            <Text style={[styles.tabCount, isActive && styles.tabCountActive]}>
              {tabCounts[tabKey]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
});

const FileRow = React.memo(function FileRow({
  item,
  onOpenMenu,
}: {
  item: FileItem;
  onOpenMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(
    () => createChatProfileMediaSectionStyles(themeColors),
    [themeColors],
  );
  return (
    <Pressable
      onLongPress={(event) => onOpenMenu(item.id, event)}
      delayLongPress={220}
      style={({ pressed }) => [styles.fileRow, pressed && styles.fileRowPressed]}
    >
      <View style={styles.fileBadge}>
        <Text style={styles.fileBadgeText}>{item.extension}</Text>
      </View>
      <View style={styles.fileTextWrap}>
        <Text style={styles.fileTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.fileSubtitle} numberOfLines={1}>
          {item.subtitle}
        </Text>
      </View>
    </Pressable>
  );
});

/** Сетка превью — переиспользуется в профиле канала */
export const MediaTilePreview = React.memo(function MediaTilePreview({
  item,
  peerFirstLineId,
}: {
  item: MediaTile;
  peerFirstLineId?: string | null;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(
    () => createChatProfileMediaSectionStyles(themeColors),
    [themeColors],
  );
  const isVideo = item.kind === 'video';
  /** Peer-first только для явного thumbnail URL; иначе извлечение кадра из `item.uri` через useVideoPreviewUri. */
  const thumbUrlForPeer = isVideo ? item.previewUri?.trim() ?? '' : item.uri;
  const peerResolvedThumb = usePeerFirstResolvedUri(peerFirstLineId, thumbUrlForPeer || null);
  const generatedPreviewUri = useVideoPreviewUri(
    isVideo ? item.uri : null,
    isVideo && item.previewUri?.trim() ? peerResolvedThumb : null
  );
  const previewUri = isVideo ? generatedPreviewUri || peerResolvedThumb : peerResolvedThumb;

  if (!previewUri) {
    return (
      <View style={[styles.mediaImage, styles.mediaVideoFallback]}>
        <Feather name="video" size={24} color="#FFFFFF" />
      </View>
    );
  }

  return (
    <Image
      key={previewUri}
      source={{ uri: previewUri }}
      style={styles.mediaImage}
      transition={250}
      contentFit="cover"
      cachePolicy="memory-disk"
    />
  );
});

const VoiceRow = React.memo(function VoiceRow({
  item,
  onOpenMenu,
}: {
  item: VoiceItem;
  onOpenMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(
    () => createChatProfileMediaSectionStyles(themeColors),
    [themeColors],
  );
  const { play, pause } = useVoicePlayerControls();
  const { isCurrent, isPlaying, progress, remainingMs } = useVoicePlaybackForUri(
    item.uri,
    item.durationMs
  );
  const durationLabel = isCurrent && (isPlaying || progress > 0)
    ? formatRemainingPlaybackDuration(remainingMs)
    : formatMediaDuration(item.durationMs);
  const bars = useMemo(
    () => buildVoiceProfileBarHeights(item.waveform, item.uri, item.durationMs),
    [item.durationMs, item.uri, item.waveform],
  );

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
          Alert.alert('Не удалось воспроизвести', 'Попробуй еще раз чуть позже.');
        });
      } else {
        void play(item.uri).catch(() => {
          Alert.alert('Не удалось воспроизвести', 'Попробуй еще раз чуть позже.');
        });
      }
    } catch {
      Alert.alert('Не удалось воспроизвести', 'Попробуй еще раз чуть позже.');
    }
  };

  return (
    <Pressable
      onLongPress={(event) => onOpenMenu(item.id, event)}
      delayLongPress={220}
      style={styles.voiceRow}
    >
      <Pressable
        onPress={() => {
          void handlePlayPress();
        }}
        style={({ pressed }) => [
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
      </Pressable>

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
                    backgroundColor: isFilled
                      ? themeColors.accent
                      : withAlpha(themeColors.accent, 0.24),
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
    </Pressable>
  );
});

const VideoNoteVoiceRow = React.memo(function VideoNoteVoiceRow({
  item,
  onOpen,
  onOpenMenu,
}: {
  item: VoiceItem;
  onOpen: (item: VoiceItem) => void;
  onOpenMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(
    () => createChatProfileMediaSectionStyles(themeColors),
    [themeColors],
  );
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
            key={previewUri}
            source={{ uri: previewUri }}
            style={styles.videoNoteThumb}
            transition={250}
            contentFit="cover"
            cachePolicy="memory-disk"
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

const LinkRow = React.memo(function LinkRow({
  item,
  onOpenMenu,
}: {
  item: LinkItem;
  onOpenMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(
    () => createChatProfileMediaSectionStyles(themeColors),
    [themeColors],
  );
  return (
    <Pressable
      onLongPress={(event) => onOpenMenu(item.id.split('-')[0] ?? item.id, event)}
      delayLongPress={220}
      style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
    >
      <View style={styles.linkIconWrap}>
        <Feather name="link" size={17} color={themeColors.accent} />
      </View>
      <View style={styles.linkTextWrap}>
        <Text style={styles.linkTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.linkSubtitle} numberOfLines={1}>
          {item.subtitle}
        </Text>
      </View>
      <Feather name="external-link" size={16} color={themeColors.iconMuted} />
    </Pressable>
  );
});

export const ChatProfileMediaSection = React.memo(function ChatProfileMediaSection({
  activeTab,
  mediaItems,
  fileItems,
  voiceItems,
  linkItems,
  onChangeTab,
  onOpenMedia,
  onOpenVideoNote,
  onOpenActionMenu,
  peerFirstLineId,
}: ChatProfileMediaSectionProps) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(
    () => createChatProfileMediaSectionStyles(themeColors),
    [themeColors],
  );
  const tabCounts = useMemo<Record<ProfileTabKey, number>>(
    () => ({
      media: mediaItems.length,
      files: fileItems.length,
      voice: voiceItems.length,
      links: linkItems.length,
    }),
    [fileItems.length, linkItems.length, mediaItems.length, voiceItems.length]
  );

  const tabContent = useMemo(() => {
    if (activeTab === 'media') {
      if (mediaItems.length === 0) {
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Пока нет медиа</Text>
            <Text style={styles.emptySubtitle}>
              Фото и видеосообщения из чата появятся здесь.
            </Text>
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
              style={({ pressed }) => [styles.mediaTile, pressed && styles.mediaTilePressed]}
            >
              <MediaTilePreview item={item} peerFirstLineId={peerFirstLineId} />
              {item.kind === 'video' ? (
                <View style={styles.mediaPlayBadge}>
                  <Feather name="play" size={15} color="#FFFFFF" style={styles.voicePlayIcon} />
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
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Пока нет файлов</Text>
            <Text style={styles.emptySubtitle}>
              Документы и вложения из этого чата будут появляться здесь.
            </Text>
          </View>
        );
      }

      return (
        <View style={styles.stackSection}>
          {fileItems.map((item) => (
            <FileRow key={item.id} item={item} onOpenMenu={onOpenActionMenu} />
          ))}
        </View>
      );
    }

    if (activeTab === 'voice') {
      if (voiceItems.length === 0) {
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Пока нет голосовых</Text>
            <Text style={styles.emptySubtitle}>
              Здесь будут собраны все голосовые сообщения из этого диалога.
            </Text>
          </View>
        );
      }

      return (
        <View style={styles.stackSection}>
          {voiceItems.map((item) =>
            item.kind === 'video_note' ? (
              <VideoNoteVoiceRow
                key={item.id}
                item={item}
                onOpen={onOpenVideoNote}
                onOpenMenu={onOpenActionMenu}
              />
            ) : (
              <VoiceRow key={item.id} item={item} onOpenMenu={onOpenActionMenu} />
            )
          )}
        </View>
      );
    }

    if (linkItems.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Пока нет ссылок</Text>
          <Text style={styles.emptySubtitle}>
            Ссылки из переписки появятся на этой вкладке автоматически.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.stackSection}>
        {linkItems.map((item) => (
          <LinkRow key={item.id} item={item} onOpenMenu={onOpenActionMenu} />
        ))}
      </View>
    );
  }, [
    activeTab,
    fileItems,
    linkItems,
    mediaItems,
    onOpenActionMenu,
    onOpenMedia,
    onOpenVideoNote,
    peerFirstLineId,
    styles,
    voiceItems,
  ]);

  return (
    <View style={styles.mediaSectionCard}>
      <ProfileTabsBar activeTab={activeTab} tabCounts={tabCounts} onChangeTab={onChangeTab} />
      {tabContent}
    </View>
  );
});
