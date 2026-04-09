import React from 'react';
import { BlurView } from 'expo-blur';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Message } from '../stores/types';

const MENU_WIDTH = 232;
const MENU_EDGE_GAP = 12;
const REACTION_BAR_HEIGHT = 50;
const REACTION_BAR_WIDTH = 306;
const MENU_REACTIONS = [
  '\u2764\uFE0F',
  '\u{1F44F}',
  '\u{1F62D}',
  '\u{1F970}',
  '\u{1F48B}',
  '\u{1F923}',
  '\u{1F44D}',
];

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
  blurTargetRef: React.RefObject<View | null>;
  screenWidth: number;
  showReactions?: boolean;
  menuCardWidth?: number;
  onClose: () => void;
  onMenuAction: (key: string) => void;
  renderMenuPreviewBody: (message: Message, forcedWidth?: number) => React.ReactNode;
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
  renderMenuPreviewBody,
}: ChatContextMenuOverlayProps) {
  if (!menuState) {
    return null;
  }

  const reactionBarWidth = Math.min(
    screenWidth - MENU_EDGE_GAP * 2,
    REACTION_BAR_WIDTH
  );
  const reactionLeftBase = menuState.isMe
    ? menuState.previewLeft + menuState.previewWidth - reactionBarWidth + 8
    : menuState.previewLeft - 4;
  const reactionLeft = clamp(
    reactionLeftBase,
    MENU_EDGE_GAP,
    screenWidth - reactionBarWidth - MENU_EDGE_GAP
  );
  const reactionTop = Math.max(
    MENU_EDGE_GAP,
    menuState.previewTop - REACTION_BAR_HEIGHT - 10
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
    outputRange: [menuState.placement === 'above' ? -14 : 16, 0],
  });
  const menuScale = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.965, 1],
  });
  const previewTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [menuState.placement === 'above' ? -6 : 10, 0],
  });
  const reactionTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  return (
    <View pointerEvents="box-none" style={styles.menuOverlayRoot}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <Animated.View style={[styles.menuBlurWrap, { opacity: backdropOpacity }]}>
          <BlurView
            intensity={100}
            tint="default"
            blurMethod="dimezisBlurView"
            blurReductionFactor={1}
            blurTarget={blurTargetRef}
            style={styles.menuBackdropBlur}
          />
        </Animated.View>
      </Pressable>

      {activeMenuMessage ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.menuPreviewOverlay,
            {
              top: menuState.previewTop,
              left: menuState.previewLeft,
              width: menuState.previewWidth,
              opacity: menuAnim,
              transform: [{ translateY: previewTranslateY }, { scale: menuScale }],
            },
          ]}
        >
          <View
            style={[
              styles.menuPreviewWrap,
              { width: menuState.previewWidth },
              menuState.isMe ? styles.menuPreviewWrapMe : styles.menuPreviewWrapOther,
            ]}
          >
            {renderMenuPreviewBody(activeMenuMessage, menuState.previewWidth)}
          </View>
        </Animated.View>
      ) : null}

      {showReactions ? (
        <Animated.View
          style={[
            styles.reactionBar,
            {
              width: reactionBarWidth,
              top: reactionTop,
              left: reactionLeft,
              opacity: menuAnim,
              transform: [{ translateY: reactionTranslateY }, { scale: menuScale }],
            },
          ]}
        >
          <View pointerEvents="none" style={styles.reactionBarTint} />
          {MENU_REACTIONS.map((reaction) => (
            <View key={reaction} style={styles.reactionEmojiSlot}>
              <Text style={styles.reactionEmoji}>{reaction}</Text>
            </View>
          ))}
          <View style={styles.reactionCheck}>
            <Feather name="check" size={18} color="#FFFFFF" />
          </View>
        </Animated.View>
      ) : null}

      <Animated.View
        style={[
          styles.menuCard,
          {
            width: menuCardWidth,
            top: menuState.menuTop,
            left: menuLeft,
            opacity: menuAnim,
            transform: [{ translateY: menuTranslateY }, { scale: menuScale }],
          },
        ]}
      >
        <View pointerEvents="none" style={styles.menuCardBaseTint} />
        <View pointerEvents="none" style={styles.menuCardAccentTint} />
        {menuActions.map((action, index) => (
          <Pressable
            key={action.key}
            disabled={action.disabled}
            style={({ pressed }) => [
              styles.menuAction,
              action.textOnly && styles.menuActionTextOnly,
              action.disabled && styles.menuActionDisabled,
              index < menuActions.length - 1 && styles.menuActionBorder,
              pressed && !action.disabled && styles.menuActionPressed,
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
    zIndex: 2,
  },
  menuPreviewWrap: {
    flexShrink: 1,
    minWidth: 0,
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
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.74)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 8,
    gap: 6,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    zIndex: 4,
  },
  reactionBarTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(247,250,255,0.34)',
  },
  reactionEmojiSlot: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmoji: {
    fontSize: 26,
    lineHeight: 30,
  },
  reactionCheck: {
    marginLeft: 'auto',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#B7D796',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.84)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCard: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.76)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
    zIndex: 3,
  },
  menuCardBaseTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(252,253,255,0.36)',
  },
  menuCardAccentTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(133,221,235,0.08)',
  },
  menuAction: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 17,
    gap: 12,
  },
  menuActionTextOnly: {
    minHeight: 54,
    justifyContent: 'center',
  },
  menuActionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226,232,240,0.86)',
  },
  menuActionDisabled: {
    opacity: 0.55,
  },
  menuActionPressed: {
    backgroundColor: 'rgba(77,141,255,0.08)',
  },
  menuActionLabel: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '500',
  },
});
