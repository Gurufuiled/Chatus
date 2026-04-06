import React from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';

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
  onMutePress: () => void;
  onSearchPress: () => void;
  onMorePress: () => void;
  moreButtonRef?: React.RefObject<View | null>;
};

type QuickActionButtonProps = {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  active?: boolean;
  onPress: () => void;
  buttonRef?: React.RefObject<View | null>;
  waveOnPress?: boolean;
};

const HERO_COLLAPSED_SIZE = 108;

const QuickActionButton = React.memo(function QuickActionButton({
  icon,
  label,
  active = false,
  onPress,
  buttonRef,
  waveOnPress = false,
}: QuickActionButtonProps) {
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
      style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
    >
      <View style={[styles.quickActionIconWrap, active && styles.quickActionIconWrapActive]}>
        {waveOnPress ? (
          <RNAnimated.View pointerEvents="none" style={[styles.quickActionWave, waveStyle]} />
        ) : null}
        <RNAnimated.View style={{ transform: [{ scale: iconScale }] }}>
          <Feather name={icon} size={18} color={active ? '#FFFFFF' : colors.accent} />
        </RNAnimated.View>
      </View>
      <Text style={[styles.quickActionLabel, active && styles.quickActionLabelActive]}>
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
  onMutePress,
  onSearchPress,
  onMorePress,
  moreButtonRef,
}: ChatProfileHeroProps) {
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
    paddingTop: interpolate(progress.value, [0, 1], [24, 0]),
    paddingBottom: interpolate(progress.value, [0, 1], [18, 16]),
  }));

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
          <QuickActionButton
            icon="phone"
            label="Звонок"
            onPress={() => {
              void onStartCallPress();
            }}
          />
          <QuickActionButton
            icon={isMuted ? 'bell-off' : 'bell'}
            label="Звук"
            active={isMuted}
            onPress={onMutePress}
          />
          <QuickActionButton icon="search" label="Поиск" onPress={onSearchPress} />
          <QuickActionButton
            icon="more-horizontal"
            label="Ещё"
            onPress={onMorePress}
            buttonRef={moreButtonRef}
            waveOnPress
          />
        </Reanimated.View>

        {loading ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.loaderText}>Загружаем профиль...</Text>
          </View>
        ) : null}

        {!loading && error ? <Text style={styles.errorText}>{error}</Text> : null}
      </Reanimated.View>
    </Reanimated.View>
  );
});

const styles = StyleSheet.create({
  heroCard: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 18,
    backgroundColor: '#F7F9FD',
    overflow: 'hidden',
  },
  avatarPressable: {
    width: '100%',
    alignItems: 'center',
  },
  avatarPressablePressed: {
    opacity: 0.96,
  },
  avatarFrame: {
    width: HERO_COLLAPSED_SIZE,
    height: HERO_COLLAPSED_SIZE,
    borderRadius: 54,
    marginBottom: 14,
    overflow: 'hidden',
    backgroundColor: '#DCE7F8',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  avatarMedia: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroContent: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  name: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  status: {
    marginTop: 4,
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  handle: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
    textAlign: 'center',
  },
  quickActionsRow: {
    marginTop: 20,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  quickAction: {
    width: 64,
    alignItems: 'center',
  },
  quickActionPressed: {
    opacity: 0.76,
  },
  quickActionIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(216,224,234,0.8)',
    shadowColor: '#89A8D8',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  quickActionIconWrapActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  quickActionLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
    textAlign: 'center',
  },
  quickActionLabelActive: {
    color: colors.accent,
  },
  quickActionWave: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: 'rgba(77,141,255,0.82)',
  },
  loaderRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loaderText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  errorText: {
    marginTop: 16,
    fontSize: 14,
    textAlign: 'center',
    color: '#E05263',
  },
});
