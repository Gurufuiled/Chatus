import React, { useMemo } from 'react';
import Feather from '@expo/vector-icons/Feather';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Easing,
  Image,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { ProfileActionIcon, type ProfileActionIconName } from './ProfileActionIcon';
import { useTheme } from '../contexts/ThemeContext';
import {
  createChatProfileHeroStyles,
  type ChatProfileHeroStyleSet,
} from './chatProfileHero.styles';

type ChatProfileHeroProps = {
  avatarUrl: string | null;
  avatarColor: string;
  initial: string;
  displayName: string;
  statusLabel: string;
  handleLabel: string | null;
  loading: boolean;
  error: string | null;
  isMuted: boolean;
  isExpanded: boolean;
  expandedHeroWidth: number;
  expandedHeroHeight: number;
  onToggleHeroExpanded: () => void;
  onStartCallPress: () => void | Promise<void>;
  onStartVideoCallPress: () => void | Promise<void>;
  onMutePress: () => void;
  onSearchPress: () => void;
  onMorePress: () => void;
  onBackPress: () => void;
  onEditPress: () => void;
  moreButtonRef?: React.RefObject<View | null>;
  /** Hide voice/video (e.g. Telegram broadcast channels). */
  hideCallAndVideoActions?: boolean;
};

type QuickActionButtonProps = {
  icon: ProfileActionIconName;
  label: string;
  /** Состояние иконки (например, без звука). */
  active?: boolean;
  /**
   * Если true, `active` меняет только глиф (колокол/без звука), без синей заливки кнопки.
   */
  iconOnlyActive?: boolean;
  onPress: () => void;
  buttonRef?: React.RefObject<View | null>;
  waveOnPress?: boolean;
  styles: ChatProfileHeroStyleSet;
  accentColor: string;
};

const HERO_COLLAPSED_SIZE = 108;

const QuickActionButton = React.memo(function QuickActionButton({
  icon,
  label,
  active = false,
  iconOnlyActive = false,
  onPress,
  buttonRef,
  waveOnPress = false,
  styles,
  accentColor,
}: QuickActionButtonProps) {
  const filledAccent = Boolean(active && !iconOnlyActive);
  const waveAnimation = React.useRef(new RNAnimated.Value(0)).current;
  const iconScale = React.useRef(new RNAnimated.Value(1)).current;

  const handlePress = React.useCallback(() => {
    if (waveOnPress) {
      waveAnimation.stopAnimation();
      iconScale.stopAnimation();
      waveAnimation.setValue(0);
      iconScale.setValue(1);

      RNAnimated.parallel([
        RNAnimated.timing(waveAnimation, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        RNAnimated.sequence([
          RNAnimated.timing(iconScale, {
            toValue: 0.92,
            duration: 90,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          RNAnimated.spring(iconScale, {
            toValue: 1,
            damping: 12,
            stiffness: 240,
            mass: 0.75,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }

    onPress();
  }, [iconScale, onPress, waveAnimation, waveOnPress]);

  const waveStyle = React.useMemo(
    () => ({
      opacity: waveAnimation.interpolate({
        inputRange: [0, 0.18, 1],
        outputRange: [0, 0.2, 0],
      }),
      transform: [
        {
          scale: waveAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [0.32, 1.45],
          }),
        },
      ],
    }),
    [waveAnimation]
  );

  return (
    <Pressable
      ref={buttonRef}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.quickAction,
        filledAccent && styles.quickActionActive,
        pressed && styles.quickActionPressed,
      ]}
    >
      {waveOnPress ? (
        <RNAnimated.View pointerEvents="none" style={[styles.quickActionWave, waveStyle]} />
      ) : null}
      <View style={styles.quickActionIconSlot}>
        <RNAnimated.View style={{ transform: [{ scale: iconScale }] }}>
          <ProfileActionIcon
            name={icon}
            size={20.5}
            color={filledAccent ? '#FFFFFF' : accentColor}
            active={active}
          />
        </RNAnimated.View>
      </View>
      <Text style={[styles.quickActionLabel, filledAccent && styles.quickActionLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
});

export const ChatProfileHero = React.memo(function ChatProfileHero({
  avatarUrl,
  avatarColor,
  initial,
  displayName,
  statusLabel,
  handleLabel,
  loading,
  error,
  isMuted,
  isExpanded,
  expandedHeroWidth,
  expandedHeroHeight,
  onToggleHeroExpanded,
  onStartCallPress,
  onStartVideoCallPress,
  onMutePress,
  onSearchPress,
  onMorePress,
  onBackPress,
  onEditPress,
  moreButtonRef,
  hideCallAndVideoActions = false,
}: ChatProfileHeroProps) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createChatProfileHeroStyles(themeColors), [themeColors]);
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(isExpanded ? 1 : 0);

  React.useEffect(() => {
    progress.value = withSpring(isExpanded ? 1 : 0, {
      damping: 22,
      stiffness: 190,
      mass: 0.92,
      overshootClamping: true,
    });
  }, [isExpanded, progress]);

  const heroGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(Boolean(avatarUrl))
        .maxPointers(1)
        .activeOffsetY(8)
        .failOffsetX([-18, 18])
        .onEnd((event) => {
          if (!avatarUrl) return;

          if (!isExpanded && event.translationY > 34) {
            runOnJS(onToggleHeroExpanded)();
            return;
          }

          if (isExpanded && event.translationY < -28) {
            runOnJS(onToggleHeroExpanded)();
          }
        }),
    [avatarUrl, isExpanded, onToggleHeroExpanded]
  );

  const heroCardStyle = useAnimatedStyle(() => ({
    paddingTop: interpolate(progress.value, [0, 1], [Math.max(insets.top + 8, 18), insets.top]),
    paddingBottom: interpolate(progress.value, [0, 1], [18, 16]),
  }), [insets.top]);

  const heroFrameStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [HERO_COLLAPSED_SIZE, expandedHeroWidth]),
    height: interpolate(progress.value, [0, 1], [HERO_COLLAPSED_SIZE, expandedHeroHeight]),
    borderRadius: interpolate(progress.value, [0, 1], [54, 28]),
    borderWidth: interpolate(progress.value, [0, 1], [3, 0]),
    marginBottom: interpolate(progress.value, [0, 1], [14, 12]),
  }));

  const heroContentStyle = useAnimatedStyle(() => ({
    paddingHorizontal: interpolate(progress.value, [0, 1], [16, 18]),
    marginTop: interpolate(progress.value, [0, 1], [0, 6]),
  }));

  const actionsStyle = useAnimatedStyle(() => ({
    marginTop: interpolate(progress.value, [0, 1], [20, 10]),
  }));

  return (
    <Reanimated.View style={[styles.heroCard, heroCardStyle]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={onBackPress}
          hitSlop={10}
          style={({ pressed }) => [styles.navBubble, pressed && styles.bubblePressed]}
        >
          <Feather name="chevron-left" size={25} color={themeColors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={onEditPress}
          hitSlop={10}
          style={({ pressed }) => [styles.editBubble, pressed && styles.bubblePressed]}
        >
          <Text style={styles.editBubbleText}>Изм.</Text>
        </Pressable>
      </View>

      <GestureDetector gesture={heroGesture}>
        <Pressable
          onPress={onToggleHeroExpanded}
          disabled={!avatarUrl}
          style={({ pressed }) => [
            styles.avatarPressable,
            pressed && avatarUrl ? styles.avatarPressablePressed : null,
          ]}
        >
          <Reanimated.View
            style={[
              styles.avatarFrame,
              heroFrameStyle,
              !avatarUrl ? { backgroundColor: avatarColor } : null,
            ]}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarMedia} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>{initial}</Text>
              </View>
            )}
          </Reanimated.View>
        </Pressable>
      </GestureDetector>

      <Reanimated.View style={[styles.heroContent, heroContentStyle]}>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.status}>{statusLabel}</Text>
        {handleLabel ? <Text style={styles.handle}>{handleLabel}</Text> : null}

        <Reanimated.View style={[styles.quickActionsRow, actionsStyle]}>
          {!hideCallAndVideoActions ? (
            <>
              <QuickActionButton
                icon="call"
                label="Звонок"
                styles={styles}
                accentColor={themeColors.accent}
                onPress={() => {
                  void onStartCallPress();
                }}
              />
              <QuickActionButton
                icon="video"
                label="Видео"
                styles={styles}
                accentColor={themeColors.accent}
                onPress={() => {
                  void onStartVideoCallPress();
                }}
              />
            </>
          ) : null}
          <QuickActionButton
            icon="sound"
            label="Звук"
            active={isMuted}
            iconOnlyActive
            styles={styles}
            accentColor={themeColors.accent}
            onPress={onMutePress}
          />
          <QuickActionButton
            icon="search"
            label="Поиск"
            styles={styles}
            accentColor={themeColors.accent}
            onPress={onSearchPress}
          />
          <QuickActionButton
            icon="more"
            label="Ещё"
            styles={styles}
            accentColor={themeColors.accent}
            onPress={onMorePress}
            buttonRef={moreButtonRef}
            waveOnPress
          />
        </Reanimated.View>

        {loading ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator size="small" color={themeColors.accent} />
            <Text style={styles.loaderText}>Загружаем профиль...</Text>
          </View>
        ) : null}

        {!loading && error ? <Text style={styles.errorText}>{error}</Text> : null}
      </Reanimated.View>
    </Reanimated.View>
  );
});
