import React, { useMemo } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AnchoredPopoverMenu,
  type AnchoredMenuState,
  type AnchoredPopoverMenuItem,
} from './AnchoredPopoverMenu';
import { ChatProfileMediaViewerModal } from './ChatProfileMediaViewerModal';
import { FloatingVideoNoteOverlay } from './FloatingVideoNoteOverlay';
import type { MediaTile, VoiceItem } from './ChatProfileMediaSection';
import { colors, withAlpha } from '../theme/colors';

type ProfileActionMenuState = {
  messageId: string;
  top: number;
  left: number;
} | null;

type ChatProfileOverlayLayerProps = {
  moreMenu: AnchoredMenuState;
  moreMenuAnimation: Animated.Value;
  moreMenuItems: AnchoredPopoverMenuItem[];
  moreMenuCustomBody?: React.ReactNode | null;
  moreMenuCustomBodyHeight?: number;
  onCloseMoreMenu: () => void;
  onMoreMenuAction: (key: string) => void;
  mediaItems: MediaTile[];
  selectedMediaIndex: number | null;
  onChangeMediaIndex: (index: number) => void;
  onCloseMedia: () => void;
  floatingVideoNote: VoiceItem | null;
  onCloseFloatingVideoNote: () => void;
  actionMenu: ProfileActionMenuState;
  actionMenuAnimation: Animated.Value;
  onCloseActionMenu: () => void;
  onShowInChat: (messageId: string) => void;
};

export const ChatProfileOverlayLayer = React.memo(function ChatProfileOverlayLayer({
  moreMenu,
  moreMenuAnimation,
  moreMenuItems,
  moreMenuCustomBody = null,
  moreMenuCustomBodyHeight = 260,
  onCloseMoreMenu,
  onMoreMenuAction,
  mediaItems,
  selectedMediaIndex,
  onChangeMediaIndex,
  onCloseMedia,
  floatingVideoNote,
  onCloseFloatingVideoNote,
  actionMenu,
  actionMenuAnimation,
  onCloseActionMenu,
  onShowInChat,
}: ChatProfileOverlayLayerProps) {
  const actionMenuBackdropOpacity = useMemo(
    () =>
      actionMenuAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
    [actionMenuAnimation]
  );

  const actionMenuCardStyle = useMemo(
    () => ({
      opacity: actionMenuAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
      transform: [
        {
          translateY: actionMenuAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [20, 0],
          }),
        },
        {
          scale: actionMenuAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [0.88, 1],
          }),
        },
      ],
      ...Platform.select({
        android: {
          elevation: actionMenuAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 10],
          }),
        },
        default: {},
      }),
    }),
    [actionMenuAnimation]
  ) as any;

  return (
    <>
      <AnchoredPopoverMenu
        menu={moreMenu}
        animation={moreMenuAnimation}
        items={moreMenuCustomBody != null ? [] : moreMenuItems}
        customBody={moreMenuCustomBody}
        customBodyEstimatedHeight={moreMenuCustomBodyHeight}
        onClose={onCloseMoreMenu}
        onSelect={onMoreMenuAction}
        horizontalAlign="end"
        offsetY={8}
      />

      <ChatProfileMediaViewerModal
        visible={selectedMediaIndex != null}
        items={mediaItems}
        selectedIndex={selectedMediaIndex ?? 0}
        onChangeIndex={onChangeMediaIndex}
        onClose={onCloseMedia}
      />

      <FloatingVideoNoteOverlay item={floatingVideoNote} onClose={onCloseFloatingVideoNote} />

      {actionMenu ? (
        <View style={styles.actionMenuRoot} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.actionMenuBackdrop,
              {
                opacity: actionMenuBackdropOpacity,
              },
            ]}
          >
            <Pressable style={styles.actionMenuBackdropPressable} onPress={onCloseActionMenu} />
          </Animated.View>
          <Animated.View
            style={[
              styles.actionMenuCard,
              {
                top: actionMenu.top,
                left: actionMenu.left,
              },
              actionMenuCardStyle,
            ]}
          >
            <Pressable
              onPress={() => onShowInChat(actionMenu.messageId)}
              style={({ pressed }) => [styles.actionMenuItem, pressed && styles.actionMenuItemPressed]}
            >
              <Feather name="message-circle" size={16} color={colors.textPrimary} />
              <Text style={styles.actionMenuLabel}>Показать в чате</Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  actionMenuRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
  },
  actionMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  actionMenuBackdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  actionMenuCard: {
    position: 'absolute',
    minWidth: 164,
    borderRadius: 12,
    backgroundColor: colors.inputBackgroundSolid,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    overflow: 'hidden',
  },
  actionMenuItem: {
    minHeight: 40,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionMenuItemPressed: {
    backgroundColor: withAlpha(colors.accent, 0.08),
  },
  actionMenuLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
