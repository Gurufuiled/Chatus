import React, { useMemo } from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import { Animated, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type ProfileActionMenuState = {
  messageId: string;
  top: number;
  left: number;
} | null;

type ChatProfileOverlayLayerProps = {
  isMoreMenuVisible: boolean;
  isBlocked: boolean;
  onCloseMoreMenu: () => void;
  onToggleBlocked: () => void;
  onDeleteChatPress: () => void;
  selectedMediaUri: string | null;
  onCloseMedia: () => void;
  actionMenu: ProfileActionMenuState;
  actionMenuAnimation: Animated.Value;
  onCloseActionMenu: () => void;
  onShowInChat: (messageId: string) => void;
};

export const ChatProfileOverlayLayer = React.memo(function ChatProfileOverlayLayer({
  isMoreMenuVisible,
  isBlocked,
  onCloseMoreMenu,
  onToggleBlocked,
  onDeleteChatPress,
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
      <Modal
        visible={isMoreMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={onCloseMoreMenu}
      >
        <View style={styles.moreMenuRoot}>
          <Pressable style={styles.moreMenuBackdrop} onPress={onCloseMoreMenu} />
          <View style={styles.moreMenuSheet}>
            <View style={styles.moreMenuHandle} />

            <Pressable
              onPress={onToggleBlocked}
              style={({ pressed }) => [styles.moreMenuItem, pressed && styles.moreMenuItemPressed]}
            >
              <View
                style={[
                  styles.moreMenuIconWrap,
                  isBlocked ? styles.moreMenuIconWrapNeutral : styles.moreMenuIconWrapWarning,
                ]}
              >
                <Feather
                  name="slash"
                  size={18}
                  color={isBlocked ? '#64748B' : '#F97316'}
                />
              </View>
              <View style={styles.moreMenuTextWrap}>
                <Text style={styles.moreMenuLabel}>
                  {isBlocked ? 'Разблокировать' : 'Заблокировать'}
                </Text>
                <Text style={styles.moreMenuCaption}>Локально на этом устройстве</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={onDeleteChatPress}
              style={({ pressed }) => [styles.moreMenuItem, pressed && styles.moreMenuItemPressed]}
            >
              <View style={[styles.moreMenuIconWrap, styles.moreMenuIconWrapDanger]}>
                <Feather name="trash-2" size={18} color="#EF4444" />
              </View>
              <View style={styles.moreMenuTextWrap}>
                <Text style={[styles.moreMenuLabel, styles.moreMenuLabelDanger]}>
                  Удалить чат
                </Text>
                <Text style={styles.moreMenuCaption}>С выбором способа удаления</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>

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
  moreMenuRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  moreMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.28)',
  },
  moreMenuSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 22,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  moreMenuHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D5DCE7',
    marginBottom: 14,
  },
  moreMenuItem: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 4,
  },
  moreMenuItemPressed: {
    opacity: 0.78,
  },
  moreMenuIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreMenuIconWrapWarning: {
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
  },
  moreMenuIconWrapNeutral: {
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
  },
  moreMenuIconWrapDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  moreMenuTextWrap: {
    flex: 1,
  },
  moreMenuLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  moreMenuLabelDanger: {
    color: '#DC2626',
  },
  moreMenuCaption: {
    marginTop: 2,
    fontSize: 13,
    color: '#7A8699',
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
