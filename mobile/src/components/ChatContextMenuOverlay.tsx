import React from 'react';
import { BlurView } from 'expo-blur';
import Feather from '@expo/vector-icons/Feather';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Message } from '../stores/types';
import { useTheme } from '../contexts/ThemeContext';
import { withAlpha } from '../theme/colors';

const MENU_WIDTH = 202;
const MENU_EDGE_GAP = 12;
const REACTION_BAR_HEIGHT = 42;
const REACTION_BAR_MIN_WIDTH = 238;
const REACTION_BAR_MAX_WIDTH = 248;
const MENU_REACTIONS = [
  '\u2764\uFE0F',
  '\u{1F44F}',
  '\u{1F62D}',
  '\u{1F970}',
  '\u{1F48B}',
  '\u{1F923}',
  '\u{1F44D}',
];

/** Как в Telegram: двойной тап по сообщению ставит это эмодзи */
export const DOUBLE_TAP_REACTION_EMOJI = MENU_REACTIONS[0];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

type ChatContextMenuOverlayProps = {
  menuState: {
    messageId: string;
    isMe: boolean;
    previewTop: number;
    previewLeft: number;
    previewWidth: number;
    previewHeight: number;
    menuTop: number;
    menuLeft: number;
    placement: 'above' | 'below';
    /** При обрезке высокого превью — с какого края показывать контент (по умолчанию низ, как в чате). */
    previewVerticalAlign?: 'top' | 'bottom';
  } | null;
  activeMenuMessage: Message | null;
  menuActions: {
    key: string;
    label: string;
    icon?: React.ComponentProps<typeof Feather>['name'] | null;
    color: string;
    disabled: boolean;
    textOnly?: boolean;
  }[];
  menuAnim: Animated.Value;
  blurTargetRef?: React.RefObject<View | null>;
  screenWidth: number;
  showReactions?: boolean;
  menuCardWidth?: number;
  onClose: () => void;
  onMenuAction: (key: string) => void;
  onPickReaction?: (emoji: string) => void;
  renderMenuPreviewBody: (message: Message, forcedWidth?: number) => React.ReactNode;
  showMenuCard?: boolean;
};

export function ChatContextMenuOverlay({
  menuState,
  activeMenuMessage,
  menuActions,
  menuAnim,
  blurTargetRef,
  screenWidth,
  showReactions = true,
  menuCardWidth = MENU_WIDTH,
  onClose,
  onMenuAction,
  onPickReaction,
  renderMenuPreviewBody,
  showMenuCard = true,
}: ChatContextMenuOverlayProps) {
  const { colors: themeColors, resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  if (!menuState) {
    return null;
  }

  const reactionBarWidth = clamp(
    menuState.previewWidth + 54,
    REACTION_BAR_MIN_WIDTH,
    Math.min(screenWidth - MENU_EDGE_GAP * 2, REACTION_BAR_MAX_WIDTH)
  );
  const reactionLeftBase = menuState.isMe
    ? menuState.previewLeft + menuState.previewWidth - reactionBarWidth
    : menuState.previewLeft;
  const reactionLeft = clamp(
    reactionLeftBase,
    MENU_EDGE_GAP,
    screenWidth - reactionBarWidth - MENU_EDGE_GAP
  );
  const menuLeft = clamp(
    menuState.menuLeft ?? MENU_EDGE_GAP,
    MENU_EDGE_GAP,
    screenWidth - menuCardWidth - MENU_EDGE_GAP
  );

  const backdropOpacity = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const menuTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
  });
  const menuScale = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.985, 1],
  });
  const previewTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 0],
  });
  const reactionTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 0],
  });

  const blurProps =
    blurTargetRef && blurTargetRef.current
      ? { blurTarget: blurTargetRef }
      : {};

  const reactionBarSurface = isDark
    ? withAlpha(themeColors.inputBackgroundSolid, 0.96)
    : 'rgba(255,255,255,0.96)';
  const reactionCheckBg = isDark ? withAlpha(themeColors.accent, 0.42) : 'rgba(0, 200, 83, 0.28)';
  const menuCardSurface = isDark
    ? withAlpha(themeColors.inputBackgroundSolid, 0.94)
    : 'rgba(255,255,255,0.94)';
  const menuCardBorder = isDark ? themeColors.composerBorder : 'rgba(255,255,255,0.84)';
  const menuCardTint = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(250,252,255,0.22)';
  const menuRowBorder = isDark ? themeColors.separator : '#ECEEF2';
  const menuRowPressed = isDark ? themeColors.rowPressed : 'rgba(77,141,255,0.07)';
  const blurTint = isDark ? 'dark' : 'light';

  return (
    <View pointerEvents="box-none" style={styles.menuOverlayRoot}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <Animated.View style={[styles.menuBlurWrap, { opacity: backdropOpacity }]}>
          <BlurView
            intensity={100}
            tint={blurTint}
            blurMethod="dimezisBlurView"
            blurReductionFactor={1}
            {...blurProps}
            style={styles.menuBackdropBlur}
          />
        </Animated.View>
      </Pressable>

      {showReactions ? (
        <Animated.View
          style={[
            styles.reactionBar,
            {
              width: reactionBarWidth,
              top: Math.max(MENU_EDGE_GAP, menuState.previewTop - REACTION_BAR_HEIGHT - 6),
              left: reactionLeft,
              opacity: menuAnim,
              transform: [{ translateY: reactionTranslateY }, { scale: menuScale }],
              backgroundColor: reactionBarSurface,
              shadowOpacity: isDark ? 0.35 : 0.16,
            },
          ]}
        >
          {MENU_REACTIONS.map((reaction) => (
            <Pressable
              key={reaction}
              onPress={() => {
                onPickReaction?.(reaction);
              }}
              style={({ pressed }) => [styles.reactionPressable, pressed && styles.reactionPressablePressed]}
              hitSlop={6}
            >
              <Text style={styles.reactionEmoji}>
                {reaction}
              </Text>
            </Pressable>
          ))}
          <View style={[styles.reactionCheck, { backgroundColor: reactionCheckBg }]}>
            <Feather name="check" size={18} color="#FFFFFF" />
          </View>
        </Animated.View>
      ) : null}

      {activeMenuMessage ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.menuPreviewOverlay,
            {
              top: menuState.previewTop,
              left: menuState.previewLeft,
              width: menuState.previewWidth,
              height: menuState.previewHeight,
              opacity: menuAnim,
              transform: [{ translateY: previewTranslateY }, { scale: menuScale }],
            },
          ]}
        >
          <View
            style={[
              styles.menuPreviewWrap,
              menuState.previewVerticalAlign === 'top' && styles.menuPreviewWrapAlignTop,
              {
                width: menuState.previewWidth,
                height: menuState.previewHeight,
              },
              menuState.isMe ? styles.menuPreviewWrapMe : styles.menuPreviewWrapOther,
            ]}
          >
            {renderMenuPreviewBody(activeMenuMessage, menuState.previewWidth)}
          </View>
        </Animated.View>
      ) : null}

      {showMenuCard ? (
        <Animated.View
          style={[
            styles.menuCard,
            {
              width: menuCardWidth,
              top: menuState.menuTop,
              left: menuLeft,
              opacity: menuAnim,
              transform: [{ translateY: menuTranslateY }, { scale: menuScale }],
              backgroundColor: menuCardSurface,
              borderColor: menuCardBorder,
            },
          ]}
        >
          <View pointerEvents="none" style={[styles.menuCardTint, { backgroundColor: menuCardTint }]} />
          {menuActions.map((action, index) => (
            <Pressable
              key={action.key}
              disabled={action.disabled}
              style={({ pressed }) => [
                styles.menuAction,
                action.textOnly && styles.menuActionTextOnly,
                action.disabled && styles.menuActionDisabled,
                index < menuActions.length - 1 && [styles.menuActionBorder, { borderBottomColor: menuRowBorder }],
                pressed && !action.disabled && { backgroundColor: menuRowPressed },
              ]}
              onPress={() => onMenuAction(action.key)}
            >
              <Text style={[styles.menuActionLabel, { color: action.color }]}>
                {action.label}
              </Text>
              {action.icon ? (
                <Feather name={action.icon as never} size={18} color={action.color} />
              ) : null}
            </Pressable>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  menuOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 40,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  menuBlurWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  menuBackdropBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  menuPreviewOverlay: {
    position: 'absolute',
    zIndex: 12,
    elevation: 11,
  },
  menuPreviewWrap: {
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  menuPreviewWrapAlignTop: {
    justifyContent: 'flex-start',
  },
  menuPreviewWrapMe: {
    alignItems: 'flex-end',
  },
  menuPreviewWrapOther: {
    alignItems: 'flex-start',
  },
  reactionBar: {
    position: 'absolute',
    height: REACTION_BAR_HEIGHT,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.96)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 6,
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
    zIndex: 14,
  },
  reactionEmoji: {
    fontSize: 24,
    lineHeight: 28,
    textAlign: 'center',
    width: 28,
  },
  reactionPressable: {
    width: 28,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionPressablePressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  reactionCheck: {
    marginLeft: 'auto',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#CDE0C0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCard: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.84)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    zIndex: 10,
  },
  menuCardTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(250,252,255,0.22)',
  },
  menuAction: {
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  menuActionTextOnly: {
    minHeight: 50,
    justifyContent: 'center',
  },
  menuActionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#ECEEF2',
  },
  menuActionDisabled: {
    opacity: 0.55,
  },
  menuActionLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
});
