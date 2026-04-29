import React, { useMemo } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Reanimated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';
import { AnimatedPlayPauseIcon } from './AnimatedPlayPauseIcon';

/** Видеосообщения — отдельный акцент от голосового (accent), читаемый на светлой и тёмной плашке. */
const VIDEO_NOTE_BRAND = '#8B5CF6';

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

type ChatTopBannerStyles = ReturnType<typeof createChatTopBannerStyles>;

function createChatTopBannerStyles(c: ThemeColors) {
  const bannerSurface = withAlpha(c.inputBackgroundSolid, 0.96);
  const bannerBorder = withAlpha(c.bubbleOtherBorder, 0.85);
  const selectionSurface = withAlpha(c.inputBackgroundSolid, 0.92);
  const selectionSurfacePrimary = withAlpha(c.header, 0.96);

  return StyleSheet.create({
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
      backgroundColor: selectionSurface,
      borderWidth: 1,
      borderColor: bannerBorder,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    selectionPillPrimary: {
      flex: 1,
      backgroundColor: selectionSurfacePrimary,
      borderColor: withAlpha(c.accent, 0.22),
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
      backgroundColor: c.accent,
      shadowColor: c.accent,
      shadowOpacity: 0.22,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    selectionBannerText: {
      fontSize: 16,
      fontWeight: '700',
      color: c.textPrimary,
    },
    selectionBannerAction: {
      fontSize: 16,
      fontWeight: '600',
      color: c.textSecondary,
    },
    voiceBannerWrap: {
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 4,
      zIndex: 10,
    },
    voiceBanner: {
      height: 44,
      borderRadius: 22,
      paddingLeft: 8,
      paddingRight: 8,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: bannerSurface,
      shadowColor: '#000',
      shadowOpacity: 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: bannerBorder,
      overflow: 'hidden',
    },
    videoNoteBanner: {
      backgroundColor: withAlpha(c.inputBackgroundSolid, 0.98),
    },
    voiceBannerPlayButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
      shadowColor: c.accent,
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    videoNotePlayButton: {
      backgroundColor: VIDEO_NOTE_BRAND,
      shadowColor: VIDEO_NOTE_BRAND,
    },
    voiceBannerTextWrap: {
      flex: 1,
      minWidth: 0,
      marginLeft: 6,
    },
    voiceBannerAuthor: {
      fontSize: 14,
      fontWeight: '700',
      color: c.textPrimary,
    },
    voiceBannerSubtitle: {
      marginTop: 1,
      fontSize: 12,
      color: c.textSecondary,
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
      color: c.textSecondary,
    },
    videoNoteMetaBadge: {
      minWidth: 54,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(VIDEO_NOTE_BRAND, 0.16),
    },
    videoNoteMetaBadgeText: {
      fontSize: 13,
      fontWeight: '700',
      color: VIDEO_NOTE_BRAND,
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
      backgroundColor: withAlpha(c.accent, 0.14),
    },
    voiceBannerProgressFill: {
      height: '100%',
      backgroundColor: c.accent,
    },
    videoNoteProgressFill: {
      backgroundColor: VIDEO_NOTE_BRAND,
    },
    pinnedBannerWrap: {
      paddingHorizontal: 12,
      paddingTop: 8,
    },
    pinnedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: withAlpha(c.inputBackgroundSolid, 0.94),
      borderRadius: 16,
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: bannerBorder,
    },
    pinnedAccent: {
      width: 3,
      alignSelf: 'stretch',
      borderRadius: 999,
      backgroundColor: c.accent,
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
      color: c.accent,
    },
    pinnedText: {
      marginTop: 2,
      fontSize: 13,
      lineHeight: 17,
      color: c.textPrimary,
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
      backgroundColor: withAlpha(c.toolbar, 0.96),
    },
    searchBubble: {
      flex: 1,
      minHeight: 40,
      borderRadius: 14,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.inputBackground,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 0,
      fontSize: 17,
      color: c.textPrimary,
    },
    searchCancelButton: {
      paddingVertical: 8,
    },
    searchCancelText: {
      fontSize: 17,
      fontWeight: '500',
      color: c.accent,
    },
  });
}

type SelectionBannerProps = {
  selectedCount: number;
  onClearSelection: () => void;
  st: ChatTopBannerStyles;
  cancelIconColor: string;
};

type VoiceBannerProps = {
  activeVoiceAuthor: string | null;
  activeVoiceIsPlaying: boolean;
  activeVoiceRateLabel: string;
  activeVoiceProgress: number;
  onToggleVoicePlayback: () => void;
  onCycleVoiceRate: () => void;
  onStopVoice: () => void;
  st: ChatTopBannerStyles;
  closeIconColor: string;
};

type VideoNoteBannerProps = {
  activeVideoNoteAuthor: string | null;
  activeVideoNoteIsPlaying: boolean;
  activeVideoNoteProgress: number;
  activeVideoNoteDurationLabel: string;
  onToggleVideoNotePlayback: () => void;
  onStopVideoNote: () => void;
  st: ChatTopBannerStyles;
  closeIconColor: string;
};

type PinnedBannerProps = {
  pinnedMessageText: string;
  onPinnedPress: () => void;
  onPinnedClose: () => void;
  st: ChatTopBannerStyles;
  iconMuted: string;
};

type SearchBannerProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onCancelSearch: () => void;
  searchInputRef: React.RefObject<TextInput | null>;
  st: ChatTopBannerStyles;
  accent: string;
  placeholderColor: string;
  searchIconColor: string;
};

const selectionBannerEntering = FadeInDown.springify().damping(18).stiffness(220);
const selectionBannerExiting = FadeOutUp.duration(140);

const SelectionBanner = React.memo(function SelectionBanner({
  selectedCount,
  onClearSelection,
  st,
  cancelIconColor,
}: SelectionBannerProps) {
  return (
    <Reanimated.View
      entering={selectionBannerEntering}
      exiting={selectionBannerExiting}
      style={st.selectionBannerWrap}
    >
      <View style={st.selectionBannerRow}>
        <View style={[st.selectionPill, st.selectionPillPrimary]}>
          <View style={st.selectionPillIconAccent}>
            <Feather name="check" size={14} color="#FFFFFF" />
          </View>
          <Text style={st.selectionBannerText}>Выбрано {selectedCount}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отменить выбор сообщений"
          hitSlop={10}
          onPress={onClearSelection}
          style={({ pressed }) => [st.selectionPill, pressed && st.selectionPillPressed]}
        >
          <Feather name="x" size={15} color={cancelIconColor} />
          <Text style={st.selectionBannerAction}>Отмена</Text>
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
  st,
  closeIconColor,
}: VoiceBannerProps) {
  return (
    <View style={st.voiceBannerWrap}>
      <View style={st.voiceBanner}>
        <Pressable
          onPress={onToggleVoicePlayback}
          style={({ pressed }) => [st.voiceBannerPlayButton, pressed && st.voiceBannerButtonPressed]}
        >
          <AnimatedPlayPauseIcon isPlaying={activeVoiceIsPlaying} size={16} color="#FFFFFF" />
        </Pressable>

        <View style={st.voiceBannerTextWrap}>
          <Text numberOfLines={1} style={st.voiceBannerAuthor}>
            {activeVoiceAuthor ?? 'Голосовое сообщение'}
          </Text>
          <Text numberOfLines={1} style={st.voiceBannerSubtitle}>
            Голосовое сообщение
          </Text>
        </View>

        <Pressable
          onPress={onCycleVoiceRate}
          style={({ pressed }) => [st.voiceBannerRateButton, pressed && st.voiceBannerButtonPressed]}
        >
          <Text style={st.voiceBannerRateText}>{activeVoiceRateLabel}</Text>
        </Pressable>

        <Pressable
          onPress={onStopVoice}
          style={({ pressed }) => [st.voiceBannerCloseButton, pressed && st.voiceBannerButtonPressed]}
        >
          <Feather name="x" size={18} color={closeIconColor} />
        </Pressable>

        <View style={st.voiceBannerProgressTrack}>
          <View
            style={[st.voiceBannerProgressFill, { width: `${Math.max(activeVoiceProgress * 100, 0)}%` }]}
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
  st,
  closeIconColor,
}: VideoNoteBannerProps) {
  return (
    <View style={st.voiceBannerWrap}>
      <View style={[st.voiceBanner, st.videoNoteBanner]}>
        <Pressable
          onPress={onToggleVideoNotePlayback}
          style={({ pressed }) => [
            st.voiceBannerPlayButton,
            st.videoNotePlayButton,
            pressed && st.voiceBannerButtonPressed,
          ]}
        >
          <AnimatedPlayPauseIcon isPlaying={activeVideoNoteIsPlaying} size={16} color="#FFFFFF" />
        </Pressable>

        <View style={st.voiceBannerTextWrap}>
          <Text numberOfLines={1} style={st.voiceBannerAuthor}>
            {activeVideoNoteAuthor ?? 'Видеосообщение'}
          </Text>
          <Text numberOfLines={1} style={st.voiceBannerSubtitle}>
            Видеосообщение
          </Text>
        </View>

        <View style={st.videoNoteMetaBadge}>
          <Text style={st.videoNoteMetaBadgeText}>{activeVideoNoteDurationLabel}</Text>
        </View>

        <Pressable
          onPress={onStopVideoNote}
          style={({ pressed }) => [st.voiceBannerCloseButton, pressed && st.voiceBannerButtonPressed]}
        >
          <Feather name="x" size={18} color={closeIconColor} />
        </Pressable>

        <View style={st.voiceBannerProgressTrack}>
          <View
            style={[
              st.voiceBannerProgressFill,
              st.videoNoteProgressFill,
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
  st,
  iconMuted,
}: PinnedBannerProps) {
  return (
    <View style={st.pinnedBannerWrap}>
      <View style={st.pinnedBanner}>
        <View style={st.pinnedAccent} />
        <Pressable onPress={onPinnedPress} style={st.pinnedMainPressable}>
          <View style={st.pinnedContent}>
            <Text style={st.pinnedTitle}>Закрепленное сообщение</Text>
            <Text numberOfLines={1} style={st.pinnedText}>
              {pinnedMessageText}
            </Text>
          </View>
        </Pressable>
        <Pressable hitSlop={10} onPress={onPinnedClose} style={st.pinnedClose}>
          <Feather name="x" size={16} color={iconMuted} />
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
  st,
  accent,
  placeholderColor,
  searchIconColor,
}: SearchBannerProps) {
  return (
    <View style={st.searchBarRow}>
      <View style={st.searchBubble}>
        <Feather name="search" size={17} color={searchIconColor} />
        <TextInput
          ref={searchInputRef}
          value={searchQuery}
          onChangeText={onSearchQueryChange}
          placeholder="Искать в чате"
          placeholderTextColor={placeholderColor}
          style={st.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          selectionColor={accent}
        />
      </View>
      <Pressable onPress={onCancelSearch} style={st.searchCancelButton}>
        <Text style={st.searchCancelText}>Отмена</Text>
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
    const { colors: c } = useTheme();
    const st = useMemo(() => createChatTopBannerStyles(c), [c]);

    if (selectionMode) {
      return (
        <SelectionBanner
          selectedCount={selectedCount}
          onClearSelection={onClearSelection}
          st={st}
          cancelIconColor={c.textSecondary}
        />
      );
    }

    const closeIconColor = c.iconMuted;

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
            st={st}
            closeIconColor={closeIconColor}
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
            st={st}
            closeIconColor={closeIconColor}
          />
        ) : null}

        {pinnedMessageText ? (
          <PinnedBanner
            pinnedMessageText={pinnedMessageText}
            onPinnedPress={onPinnedPress}
            onPinnedClose={onPinnedClose}
            st={st}
            iconMuted={c.iconMuted}
          />
        ) : null}

        {isSearchMode ? (
          <SearchBanner
            searchQuery={searchQuery}
            onSearchQueryChange={onSearchQueryChange}
            onCancelSearch={onCancelSearch}
            searchInputRef={searchInputRef}
            st={st}
            accent={c.accent}
            placeholderColor={c.placeholder}
            searchIconColor={c.textSecondary}
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
