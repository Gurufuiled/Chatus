import React, { useMemo } from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import { Animated, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AnchoredPopoverMenu,
  type AnchoredMenuState,
  type AnchoredPopoverMenuItem,
} from './AnchoredPopoverMenu';

type ProfileActionMenuState = {
  messageId: string;
  top: number;
  left: number;
} | null;

type ChatProfileOverlayLayerProps = {
  moreMenu: AnchoredMenuState;
  moreMenuAnimation: Animated.Value;
  moreMenuItems: AnchoredPopoverMenuItem[];
  onCloseMoreMenu: () => void;
  onMoreMenuAction: (key: string) => void;
  selectedMediaUri: string | null;
  onCloseMedia: () => void;
  actionMenu: ProfileActionMenuState;
  actionMenuAnimation: Animated.Value;
  onCloseActionMenu: () => void;
  onShowInChat: (messageId: string) => void;
};

export const ChatProfileOverlayLayer = React.memo(function ChatProfileOverlayLayer({
  moreMenu,
  moreMenuAnimation,
  moreMenuItems,
  onCloseMoreMenu,
  onMoreMenuAction,
  selectedMediaUri,
  onCloseMedia,
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
      opacity: actionMenuAnimation,
      transform: [
        {
          translateY: actionMenuAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [10, 0],
          }),
        },
        {
          scale: actionMenuAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [0.96, 1],
          }),
        },
      ],
    }),
    [actionMenuAnimation]
  ) as any;

  return (
    <>
      <AnchoredPopoverMenu
        menu={moreMenu}
        animation={moreMenuAnimation}
        items={moreMenuItems}
        onClose={onCloseMoreMenu}
        onSelect={onMoreMenuAction}
        horizontalAlign="end"
        offsetY={8}
      />

      <Modal
        visible={selectedMediaUri != null}
        transparent
        animationType="fade"
        onRequestClose={onCloseMedia}
      >
        <Pressable style={styles.viewerBackdrop} onPress={onCloseMedia}>
          <View style={styles.viewerContent}>
            {selectedMediaUri ? (
              <Image source={{ uri: selectedMediaUri }} style={styles.viewerImage} resizeMode="contain" />
            ) : null}
            <Pressable onPress={onCloseMedia} style={styles.viewerClose} hitSlop={10}>
              <Feather name="x" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </Pressable>
      </Modal>

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
              <Feather name="message-circle" size={16} color="#111827" />
              <Text style={styles.actionMenuLabel}>Показать в чате</Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerClose: {
    position: 'absolute',
    top: 54,
    right: 22,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  actionMenuRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
  },
  actionMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
  },
  actionMenuBackdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  actionMenuCard: {
    position: 'absolute',
    minWidth: 164,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
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
    backgroundColor: 'rgba(77,141,255,0.08)',
  },
  actionMenuLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
});
