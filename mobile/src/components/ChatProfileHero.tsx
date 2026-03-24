import React from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type ViewStyle,
} from 'react-native';
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
  heroAnimation: Animated.Value;
  expandedHeroWidth: number;
  expandedHeroHeight: number;
  onToggleHeroExpanded: () => void;
  onStartCallPress: () => void | Promise<void>;
  onMutePress: () => void;
  onSearchPress: () => void;
  onMorePress: () => void;
};

type QuickActionButtonProps = {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  active?: boolean;
  onPress: () => void;
};

const QuickActionButton = React.memo(function QuickActionButton({
  icon,
  label,
  active = false,
  onPress,
}: QuickActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
    >
      <View style={[styles.quickActionIconWrap, active && styles.quickActionIconWrapActive]}>
        <Feather name={icon} size={18} color={active ? '#FFFFFF' : colors.accent} />
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
  heroAnimation,
  expandedHeroWidth,
  expandedHeroHeight,
  onToggleHeroExpanded,
  onStartCallPress,
  onMutePress,
  onSearchPress,
  onMorePress,
}: ChatProfileHeroProps) {
  const heroCardStyle: Animated.WithAnimatedObject<ViewStyle> = {
    paddingTop: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [24, 0],
    }),
    paddingBottom: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [18, 24],
    }),
  };

  const heroAvatarStyle: Animated.WithAnimatedObject<ImageStyle> = {
    width: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [108, expandedHeroWidth],
    }),
    height: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [108, expandedHeroHeight],
    }),
    borderRadius: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [54, 0],
    }),
    marginBottom: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [14, 18],
    }),
    borderWidth: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [3, 0],
    }),
  };

  const heroContentStyle: Animated.WithAnimatedObject<ViewStyle> = {
    paddingHorizontal: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [16, 18],
    }),
  };

  const heroActionsStyle: Animated.WithAnimatedObject<ViewStyle> = {
    marginTop: heroAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [20, 16],
    }),
  };

  return (
    <Animated.View style={[styles.heroCard, heroCardStyle]}>
      <Pressable
        onPress={onToggleHeroExpanded}
        disabled={!avatarUrl}
        style={({ pressed }) => [
          styles.avatarPressable,
          pressed && avatarUrl ? styles.avatarPressablePressed : null,
        ]}
      >
        {avatarUrl ? (
          <Animated.Image source={{ uri: avatarUrl }} style={[styles.avatar, heroAvatarStyle]} />
        ) : (
          <Animated.View
            style={[
              styles.avatarFallback,
              heroAvatarStyle,
              { backgroundColor: avatarColor },
            ]}
          >
            <Text style={styles.avatarFallbackText}>{initial}</Text>
          </Animated.View>
        )}
      </Pressable>

      <Animated.View style={[styles.heroContent, heroContentStyle]}>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.status}>{statusLabel}</Text>
        {handleLabel ? <Text style={styles.handle}>{handleLabel}</Text> : null}

        <Animated.View style={[styles.quickActionsRow, heroActionsStyle]}>
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
          <QuickActionButton icon="more-horizontal" label="Еще" onPress={onMorePress} />
        </Animated.View>

        {loading ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.loaderText}>Загружаем профиль...</Text>
          </View>
        ) : null}

        {!loading && error ? <Text style={styles.errorText}>{error}</Text> : null}
      </Animated.View>
    </Animated.View>
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
  avatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
    marginBottom: 14,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  avatarFallback: {
    width: 108,
    height: 108,
    borderRadius: 54,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
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
