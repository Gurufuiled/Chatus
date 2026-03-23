import React from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors } from '../theme/colors';

type ChatTopBannersProps = {
  selectionMode: boolean;
  selectedCount: number;
  onClearSelection: () => void;
  activeVoiceVisible: boolean;
  activeVoiceAuthor: string | null;
  activeVoiceIsPlaying: boolean;
  activeVoiceRateLabel: string;
  activeVoiceProgress: number;
  onToggleVoicePlayback: () => void;
  onCycleVoiceRate: () => void;
  onStopVoice: () => void;
  pinnedMessageText: string | null;
  onPinnedPress: () => void;
  onPinnedClose: () => void;
  isSearchMode: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onCancelSearch: () => void;
  searchInputRef: React.RefObject<TextInput | null>;
};

export function ChatTopBanners({
  selectionMode,
  selectedCount,
  onClearSelection,
  activeVoiceVisible,
  activeVoiceAuthor,
  activeVoiceIsPlaying,
  activeVoiceRateLabel,
  activeVoiceProgress,
  onToggleVoicePlayback,
  onCycleVoiceRate,
  onStopVoice,
  pinnedMessageText,
  onPinnedPress,
  onPinnedClose,
  isSearchMode,
  searchQuery,
  onSearchQueryChange,
  onCancelSearch,
  searchInputRef,
}: ChatTopBannersProps) {
  return (
    <>
      {selectionMode ? (
        <View style={styles.selectionBanner}>
          <Text style={styles.selectionBannerText}>
            Выбрано: {selectedCount}
          </Text>
          <Pressable onPress={onClearSelection} hitSlop={10}>
            <Text style={styles.selectionBannerAction}>Очистить</Text>
          </Pressable>
        </View>
      ) : null}

      {activeVoiceVisible ? (
        <View style={styles.voiceBannerWrap}>
          <View style={styles.voiceBanner}>
            <Pressable
              onPress={onToggleVoicePlayback}
              style={({ pressed }) => [
                styles.voiceBannerPlayButton,
                pressed && styles.voiceBannerButtonPressed,
              ]}
            >
              <Feather
                name={activeVoiceIsPlaying ? 'pause' : 'play'}
                size={18}
                color={colors.accent}
                style={!activeVoiceIsPlaying ? styles.voiceBannerPlayIcon : undefined}
              />
            </Pressable>

            <View style={styles.voiceBannerTextWrap}>
              <Text numberOfLines={1} style={styles.voiceBannerAuthor}>
                {activeVoiceAuthor ?? 'Голосовое сообщение'}
              </Text>
              <Text numberOfLines={1} style={styles.voiceBannerSubtitle}>
                Голосовое сообщение
              </Text>
            </View>

            <Pressable
              onPress={onCycleVoiceRate}
              style={({ pressed }) => [
                styles.voiceBannerRateButton,
                pressed && styles.voiceBannerButtonPressed,
              ]}
            >
              <Text style={styles.voiceBannerRateText}>{activeVoiceRateLabel}</Text>
            </Pressable>

            <Pressable
              onPress={onStopVoice}
              style={({ pressed }) => [
                styles.voiceBannerCloseButton,
                pressed && styles.voiceBannerButtonPressed,
              ]}
            >
              <Feather name="x" size={18} color="#8A94A6" />
            </Pressable>

            <View style={styles.voiceBannerProgressTrack}>
              <View
                style={[
                  styles.voiceBannerProgressFill,
                  { width: `${Math.max(activeVoiceProgress * 100, 0)}%` },
                ]}
              />
            </View>
          </View>
        </View>
      ) : null}

      {pinnedMessageText ? (
        <View style={styles.pinnedBannerWrap}>
          <View style={styles.pinnedBanner}>
            <View style={styles.pinnedAccent} />
            <Pressable onPress={onPinnedPress} style={styles.pinnedMainPressable}>
              <View style={styles.pinnedContent}>
                <Text style={styles.pinnedTitle}>Закрепленное сообщение</Text>
                <Text numberOfLines={1} style={styles.pinnedText}>
                  {pinnedMessageText}
                </Text>
              </View>
            </Pressable>
            <Pressable
              hitSlop={10}
              onPress={onPinnedClose}
              style={styles.pinnedClose}
            >
              <Feather name="x" size={16} color="#65717E" />
            </Pressable>
          </View>
        </View>
      ) : null}

      {isSearchMode ? (
        <View style={styles.searchBarRow}>
          <View style={styles.searchBubble}>
            <Feather name="search" size={17} color="#94A3B8" />
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChangeText={onSearchQueryChange}
              placeholder="Искать в чате"
              placeholderTextColor="#A0AEC0"
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              selectionColor={colors.accent}
            />
          </View>
          <Pressable onPress={onCancelSearch} style={styles.searchCancelButton}>
            <Text style={styles.searchCancelText}>Отмена</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  selectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E7EBF0',
  },
  selectionBannerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  selectionBannerAction: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F28C28',
  },
  voiceBannerWrap: {
    paddingTop: 2,
  },
  voiceBanner: {
    minHeight: 52,
    paddingLeft: 12,
    paddingRight: 8,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.32)',
    overflow: 'hidden',
  },
  voiceBannerPlayButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceBannerPlayIcon: {
    marginLeft: 2,
  },
  voiceBannerTextWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: 6,
  },
  voiceBannerAuthor: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  voiceBannerSubtitle: {
    marginTop: 1,
    fontSize: 12,
    color: '#8A94A6',
  },
  voiceBannerRateButton: {
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  voiceBannerRateText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7A8699',
  },
  voiceBannerCloseButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  voiceBannerButtonPressed: {
    opacity: 0.7,
  },
  voiceBannerProgressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(77,141,255,0.12)',
  },
  voiceBannerProgressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  pinnedBannerWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(210, 224, 235, 0.9)',
  },
  pinnedAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 999,
    backgroundColor: '#4D8DFF',
    marginRight: 10,
  },
  pinnedContent: {
    flex: 1,
    minWidth: 0,
  },
  pinnedMainPressable: {
    flex: 1,
    minWidth: 0,
  },
  pinnedTitle: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: '#4D8DFF',
  },
  pinnedText: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    color: '#39414A',
  },
  pinnedClose: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: 'rgba(246, 248, 251, 0.92)',
  },
  searchBubble: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2F6',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 17,
    color: '#334155',
  },
  searchCancelButton: {
    paddingVertical: 8,
  },
  searchCancelText: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.accent,
  },
});
