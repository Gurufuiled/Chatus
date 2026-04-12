import React from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Reanimated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { colors, withAlpha } from '../theme/colors';

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
  activeVideoNoteVisible: boolean;
  activeVideoNoteAuthor: string | null;
  activeVideoNoteIsPlaying: boolean;
  activeVideoNoteProgress: number;
  activeVideoNoteDurationLabel: string;
  onToggleVideoNotePlayback: () => void;
  onStopVideoNote: () => void;
  pinnedMessageText: string | null;
  onPinnedPress: () => void;
  onPinnedClose: () => void;
  isSearchMode: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onCancelSearch: () => void;
  searchInputRef: React.RefObject<TextInput | null>;
};

type SelectionBannerProps = {
  selectedCount: number;
  onClearSelection: () => void;
};

type VoiceBannerProps = {
  activeVoiceAuthor: string | null;
  activeVoiceIsPlaying: boolean;
  activeVoiceRateLabel: string;
  activeVoiceProgress: number;
  onToggleVoicePlayback: () => void;
  onCycleVoiceRate: () => void;
  onStopVoice: () => void;
};

type VideoNoteBannerProps = {
  activeVideoNoteAuthor: string | null;
  activeVideoNoteIsPlaying: boolean;
  activeVideoNoteProgress: number;
  activeVideoNoteDurationLabel: string;
  onToggleVideoNotePlayback: () => void;
  onStopVideoNote: () => void;
};

type PinnedBannerProps = {
  pinnedMessageText: string;
  onPinnedPress: () => void;
  onPinnedClose: () => void;
};

type SearchBannerProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onCancelSearch: () => void;
  searchInputRef: React.RefObject<TextInput | null>;
};

const selectionBannerEntering = FadeInDown.springify().damping(18).stiffness(220);
const selectionBannerExiting = FadeOutUp.duration(140);

const SelectionBanner = React.memo(function SelectionBanner({
  selectedCount,
  onClearSelection,
}: SelectionBannerProps) {
  return (
    <Reanimated.View
      entering={selectionBannerEntering}
      exiting={selectionBannerExiting}
      style={styles.selectionBannerWrap}
    >
      <View style={styles.selectionBannerRow}>
        <View style={[styles.selectionPill, styles.selectionPillPrimary]}>
          <View style={styles.selectionPillIconAccent}>
            <Feather name="check" size={14} color="#FFFFFF" />
          </View>
          <Text style={styles.selectionBannerText}>Выбрано {selectedCount}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отменить выбор сообщений"
          hitSlop={10}
          onPress={onClearSelection}
          style={({ pressed }) => [styles.selectionPill, pressed && styles.selectionPillPressed]}
        >
          <Feather name="x" size={15} color="#475569" />
          <Text style={styles.selectionBannerAction}>Отмена</Text>
        </Pressable>
      </View>
    </Reanimated.View>
  );
});

const VoiceBanner = React.memo(function VoiceBanner({
  activeVoiceAuthor,
  activeVoiceIsPlaying,
  activeVoiceRateLabel,
  activeVoiceProgress,
  onToggleVoicePlayback,
  onCycleVoiceRate,
  onStopVoice,
}: VoiceBannerProps) {
  return (
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
  );
});

const VideoNoteBanner = React.memo(function VideoNoteBanner({
  activeVideoNoteAuthor,
  activeVideoNoteIsPlaying,
  activeVideoNoteProgress,
  activeVideoNoteDurationLabel,
  onToggleVideoNotePlayback,
  onStopVideoNote,
}: VideoNoteBannerProps) {
  return (
    <View style={styles.voiceBannerWrap}>
      <View style={[styles.voiceBanner, styles.videoNoteBanner]}>
        <Pressable
          onPress={onToggleVideoNotePlayback}
          style={({ pressed }) => [
            styles.voiceBannerPlayButton,
            styles.videoNotePlayButton,
            pressed && styles.voiceBannerButtonPressed,
          ]}
        >
          <Feather
            name={activeVideoNoteIsPlaying ? 'pause' : 'play'}
            size={18}
            color="#FFFFFF"
            style={!activeVideoNoteIsPlaying ? styles.voiceBannerPlayIcon : undefined}
          />
        </Pressable>

        <View style={styles.voiceBannerTextWrap}>
          <Text numberOfLines={1} style={styles.voiceBannerAuthor}>
            {activeVideoNoteAuthor ?? 'Видеосообщение'}
          </Text>
          <Text numberOfLines={1} style={styles.voiceBannerSubtitle}>
            Видеосообщение
          </Text>
        </View>

        <View style={styles.videoNoteMetaBadge}>
          <Text style={styles.videoNoteMetaBadgeText}>{activeVideoNoteDurationLabel}</Text>
        </View>

        <Pressable
          onPress={onStopVideoNote}
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
              styles.videoNoteProgressFill,
              { width: `${Math.max(activeVideoNoteProgress * 100, 0)}%` },
            ]}
          />
        </View>
      </View>
    </View>
  );
});

const PinnedBanner = React.memo(function PinnedBanner({
  pinnedMessageText,
  onPinnedPress,
  onPinnedClose,
}: PinnedBannerProps) {
  return (
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
        <Pressable hitSlop={10} onPress={onPinnedClose} style={styles.pinnedClose}>
          <Feather name="x" size={16} color="#65717E" />
        </Pressable>
      </View>
    </View>
  );
});

const SearchBanner = React.memo(function SearchBanner({
  searchQuery,
  onSearchQueryChange,
  onCancelSearch,
  searchInputRef,
}: SearchBannerProps) {
  return (
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
  );
});

export const ChatTopBanners = React.memo(
  function ChatTopBanners({
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
    activeVideoNoteVisible,
    activeVideoNoteAuthor,
    activeVideoNoteIsPlaying,
    activeVideoNoteProgress,
    activeVideoNoteDurationLabel,
    onToggleVideoNotePlayback,
    onStopVideoNote,
    pinnedMessageText,
    onPinnedPress,
    onPinnedClose,
    isSearchMode,
    searchQuery,
    onSearchQueryChange,
    onCancelSearch,
    searchInputRef,
  }: ChatTopBannersProps) {
    if (selectionMode) {
      return <SelectionBanner selectedCount={selectedCount} onClearSelection={onClearSelection} />;
    }

    return (
      <>
        {activeVoiceVisible ? (
          <VoiceBanner
            activeVoiceAuthor={activeVoiceAuthor}
            activeVoiceIsPlaying={activeVoiceIsPlaying}
            activeVoiceRateLabel={activeVoiceRateLabel}
            activeVoiceProgress={activeVoiceProgress}
            onToggleVoicePlayback={onToggleVoicePlayback}
            onCycleVoiceRate={onCycleVoiceRate}
            onStopVoice={onStopVoice}
          />
        ) : null}

        {activeVideoNoteVisible ? (
          <VideoNoteBanner
            activeVideoNoteAuthor={activeVideoNoteAuthor}
            activeVideoNoteIsPlaying={activeVideoNoteIsPlaying}
            activeVideoNoteProgress={activeVideoNoteProgress}
            activeVideoNoteDurationLabel={activeVideoNoteDurationLabel}
            onToggleVideoNotePlayback={onToggleVideoNotePlayback}
            onStopVideoNote={onStopVideoNote}
          />
        ) : null}

        {pinnedMessageText ? (
          <PinnedBanner
            pinnedMessageText={pinnedMessageText}
            onPinnedPress={onPinnedPress}
            onPinnedClose={onPinnedClose}
          />
        ) : null}

        {isSearchMode ? (
          <SearchBanner
            searchQuery={searchQuery}
            onSearchQueryChange={onSearchQueryChange}
            onCancelSearch={onCancelSearch}
            searchInputRef={searchInputRef}
          />
        ) : null}
      </>
    );
  },
  (prev, next) =>
    prev.selectionMode === next.selectionMode &&
    prev.selectedCount === next.selectedCount &&
    prev.onClearSelection === next.onClearSelection &&
    prev.activeVoiceVisible === next.activeVoiceVisible &&
    prev.activeVoiceAuthor === next.activeVoiceAuthor &&
    prev.activeVoiceIsPlaying === next.activeVoiceIsPlaying &&
    prev.activeVoiceRateLabel === next.activeVoiceRateLabel &&
    prev.activeVoiceProgress === next.activeVoiceProgress &&
    prev.onToggleVoicePlayback === next.onToggleVoicePlayback &&
    prev.onCycleVoiceRate === next.onCycleVoiceRate &&
    prev.onStopVoice === next.onStopVoice &&
    prev.activeVideoNoteVisible === next.activeVideoNoteVisible &&
    prev.activeVideoNoteAuthor === next.activeVideoNoteAuthor &&
    prev.activeVideoNoteIsPlaying === next.activeVideoNoteIsPlaying &&
    prev.activeVideoNoteProgress === next.activeVideoNoteProgress &&
    prev.activeVideoNoteDurationLabel === next.activeVideoNoteDurationLabel &&
    prev.onToggleVideoNotePlayback === next.onToggleVideoNotePlayback &&
    prev.onStopVideoNote === next.onStopVideoNote &&
    prev.pinnedMessageText === next.pinnedMessageText &&
    prev.onPinnedPress === next.onPinnedPress &&
    prev.onPinnedClose === next.onPinnedClose &&
    prev.isSearchMode === next.isSearchMode &&
    prev.searchQuery === next.searchQuery &&
    prev.onSearchQueryChange === next.onSearchQueryChange &&
    prev.onCancelSearch === next.onCancelSearch &&
    prev.searchInputRef === next.searchInputRef
);

const styles = StyleSheet.create({
  selectionBannerWrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  selectionBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectionPill: {
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(223,230,240,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  selectionPillPrimary: {
    flex: 1,
    backgroundColor: 'rgba(248,252,255,0.94)',
    borderColor: 'rgba(214,229,255,0.95)',
  },
  selectionPillPressed: {
    opacity: 0.82,
  },
  selectionPillIconAccent: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  selectionBannerText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#142235',
  },
  selectionBannerAction: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
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
  videoNoteBanner: {
    backgroundColor: 'rgba(255,255,255,0.98)',
  },
  voiceBannerPlayButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoNotePlayButton: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
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
  videoNoteMetaBadge: {
    minWidth: 54,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.accent, 0.1),
  },
  videoNoteMetaBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
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
    backgroundColor: withAlpha(colors.accent, 0.12),
  },
  voiceBannerProgressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  videoNoteProgressFill: {
    backgroundColor: '#7C5CFF',
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
    borderColor: 'rgba(210,224,235,0.9)',
  },
  pinnedAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 999,
    backgroundColor: colors.accent,
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
    color: colors.accent,
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
    backgroundColor: 'rgba(246,248,251,0.92)',
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
