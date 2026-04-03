import React, { useMemo } from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import {
  Alert,
  GestureResponderEvent,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useVoicePlaybackForUri,
  useVoicePlayerControls,
} from '../contexts/VoicePlayerContext';
import { buildUiWaveform } from '../services/waveformUtils';
import { colors } from '../theme/colors';

export type ProfileTabKey = 'media' | 'files' | 'voice' | 'links';

export type MediaTile = {
  id: string;
  uri: string;
  durationMs?: number;
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
  uri: string | null;
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
  onOpenMedia: (uri: string) => void;
  onOpenActionMenu: (messageId: string, event: GestureResponderEvent) => void;
};

const TAB_LABELS: Record<ProfileTabKey, string> = {
  media: 'Медиа',
  files: 'Файлы',
  voice: 'Голосовые',
  links: 'Ссылки',
};

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function buildVoicePreviewBars(waveform: number[]) {
  const base =
    waveform.length > 0
      ? buildUiWaveform(waveform, 28)
      : buildUiWaveform([0.22, 0.34, 0.58, 0.41, 0.27, 0.49, 0.31], 28);
  return base.map((value) => 4 + Math.pow(value, 1.15) * 16);
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

const VoiceRow = React.memo(function VoiceRow({
  item,
  onOpenMenu,
}: {
  item: VoiceItem;
  onOpenMenu: (messageId: string, event: GestureResponderEvent) => void;
}) {
  const { play, pause } = useVoicePlayerControls();
  const { isPlaying, progress, remainingMs } = useVoicePlaybackForUri(item.uri, item.durationMs);
  const bars = useMemo(() => buildVoicePreviewBars(item.waveform), [item.waveform]);

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
                    backgroundColor: isFilled ? colors.accent : 'rgba(77,141,255,0.24)',
                  },
                ]}
              />
            );
          })}
        </View>
        <View style={styles.voiceMetaRow}>
          <Text style={styles.voiceDuration}>{formatDuration(remainingMs)}</Text>
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
  return (
    <Pressable
      onLongPress={(event) => onOpenMenu(item.id.split('-')[0] ?? item.id, event)}
      delayLongPress={220}
      style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
    >
      <View style={styles.linkIconWrap}>
        <Feather name="link" size={17} color={colors.accent} />
      </View>
      <View style={styles.linkTextWrap}>
        <Text style={styles.linkTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.linkSubtitle} numberOfLines={1}>
          {item.subtitle}
        </Text>
      </View>
      <Feather name="external-link" size={16} color="#A6AFBC" />
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
  onOpenMedia: _onOpenMedia,
  onOpenActionMenu,
}: ChatProfileMediaSectionProps) {
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
          {mediaItems.map((item) => (
            <Pressable
              key={item.id}
              onLongPress={(event) => onOpenActionMenu(item.id, event)}
              delayLongPress={220}
              style={({ pressed }) => [styles.mediaTile, pressed && styles.mediaTilePressed]}
            >
              <Image source={{ uri: item.uri }} style={styles.mediaImage} />
              {item.durationMs ? (
                <View style={styles.mediaBadge}>
                  <Text style={styles.mediaBadgeText}>{formatDuration(item.durationMs)}</Text>
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
          {voiceItems.map((item) => (
            <VoiceRow key={item.id} item={item} onOpenMenu={onOpenActionMenu} />
          ))}
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
  }, [activeTab, fileItems, linkItems, mediaItems, onOpenActionMenu, voiceItems]);

  return (
    <View style={styles.mediaSectionCard}>
      <ProfileTabsBar activeTab={activeTab} tabCounts={tabCounts} onChangeTab={onChangeTab} />
      {tabContent}
    </View>
  );
});

const styles = StyleSheet.create({
  mediaSectionCard: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 320,
  },
  tabsRow: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    alignItems: 'center',
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#F2F5FA',
  },
  tabButtonActive: {
    backgroundColor: 'rgba(77,141,255,0.12)',
  },
  tabButtonPressed: {
    opacity: 0.8,
  },
  tabButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: '#7D8795',
  },
  tabButtonTextActive: {
    color: colors.accent,
  },
  tabCount: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#A0A9B6',
  },
  tabCountActive: {
    color: colors.accent,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 3,
  },
  mediaTile: {
    width: '33.3333%',
    aspectRatio: 1,
    padding: 3,
  },
  mediaTilePressed: {
    opacity: 0.88,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#E6ECF5',
  },
  mediaBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(16,24,40,0.6)',
  },
  mediaBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stackSection: {
    paddingHorizontal: 14,
    paddingTop: 4,
    gap: 10,
  },
  fileRow: {
    minHeight: 72,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9FD',
  },
  fileRowPressed: {
    opacity: 0.82,
  },
  fileBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77,141,255,0.14)',
    marginRight: 12,
  },
  fileBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
  },
  fileTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  fileTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  fileSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: colors.textSecondary,
  },
  voiceRow: {
    minHeight: 76,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9FD',
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
  },
  voiceDuration: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  voiceDate: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  linkRow: {
    minHeight: 72,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9FD',
  },
  linkRowPressed: {
    opacity: 0.82,
  },
  linkIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77,141,255,0.12)',
    marginRight: 12,
  },
  linkTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  linkTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  linkSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 46,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
