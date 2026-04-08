import React, { useMemo } from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
import type { GroupFileItem, GroupMediaItem, GroupVoiceItem } from './groupProfile.types';

type GroupMediaTabKey = 'media' | 'files' | 'voice';

type GroupProfileMediaContentProps = {
  activeTab: GroupMediaTabKey;
  mediaItems: GroupMediaItem[];
  fileItems: GroupFileItem[];
  voiceItems: GroupVoiceItem[];
  onOpenMedia: (index: number) => void;
  onOpenFile: (item: GroupFileItem) => void;
  onShowInChat: (messageId: string) => void;
};

function buildVoicePreviewBars(waveform: number[]) {
  const base =
    waveform.length > 0
      ? buildUiWaveform(waveform, 28)
      : buildUiWaveform([0.22, 0.34, 0.58, 0.41, 0.27, 0.49, 0.31], 28);
  return base.map((value) => 4 + Math.pow(value, 1.15) * 16);
}

const GroupFileRow = React.memo(function GroupFileRow({
  item,
  onOpenFile,
  onShowInChat,
}: {
  item: GroupFileItem;
  onOpenFile: (item: GroupFileItem) => void;
  onShowInChat: (messageId: string) => void;
}) {
  return (
    <View style={styles.fileRow}>
      <Pressable
        onPress={() => onOpenFile(item)}
        style={({ pressed }) => [styles.fileMainAction, pressed && styles.rowPressed]}
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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Показать файл в чате"
        hitSlop={8}
        onPress={() => onShowInChat(item.id)}
        style={({ pressed }) => [
          styles.rowActionButton,
          pressed && styles.rowActionButtonPressed,
        ]}
      >
        <Feather name="message-circle" size={16} color={colors.accent} />
      </Pressable>
    </View>
  );
});

const GroupVoiceRow = React.memo(function GroupVoiceRow({
  item,
  onShowInChat,
}: {
  item: GroupVoiceItem;
  onShowInChat: (messageId: string) => void;
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
    <View style={styles.voiceRow}>
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

      <Pressable
        onPress={() => {
          void handlePlayPress();
        }}
        style={({ pressed }) => [
          styles.voiceWaveWrap,
          pressed && styles.rowPressed,
        ]}
      >
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
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Показать голосовое в чате"
        hitSlop={8}
        onPress={() => onShowInChat(item.id)}
        style={({ pressed }) => [
          styles.rowActionButton,
          pressed && styles.rowActionButtonPressed,
        ]}
      >
        <Feather name="message-circle" size={16} color={colors.accent} />
      </Pressable>
    </View>
  );
});

export const GroupProfileMediaContent = React.memo(function GroupProfileMediaContent({
  activeTab,
  mediaItems,
  fileItems,
  voiceItems,
  onOpenMedia,
  onOpenFile,
  onShowInChat,
}: GroupProfileMediaContentProps) {
  if (activeTab === 'media') {
    if (mediaItems.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Пока нет медиа</Text>
          <Text style={styles.emptySubtitle}>Фото и кружочки из группы появятся здесь.</Text>
        </View>
      );
    }

    return (
      <View style={styles.mediaGrid}>
        {mediaItems.map((item, index) => (
          <Pressable
            key={item.id}
            onPress={() => onOpenMedia(index)}
            style={({ pressed }) => [styles.mediaTile, pressed && styles.rowPressed]}
          >
            <Image source={{ uri: item.uri }} style={styles.mediaImage} />
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
            onShowInChat={onShowInChat}
          />
        ))}
      </View>
    );
  }

  if (voiceItems.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Пока нет голосовых</Text>
        <Text style={styles.emptySubtitle}>Голосовые сообщения группы будут здесь.</Text>
      </View>
    );
  }

  return (
    <View style={styles.stackSection}>
      {voiceItems.map((item) => (
        <GroupVoiceRow key={item.id} item={item} onShowInChat={onShowInChat} />
      ))}
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
  fileMainAction: {
    flex: 1,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
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
  rowActionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    backgroundColor: 'rgba(77,141,255,0.12)',
  },
  rowActionButtonPressed: {
    opacity: 0.82,
  },
  rowPressed: {
    opacity: 0.86,
  },
});
