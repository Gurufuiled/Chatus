import React from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { GroupMediaItem } from './groupProfile.types';

type GroupProfileMediaViewerModalProps = {
  visible: boolean;
  mediaItems: GroupMediaItem[];
  selectedIndex: number | null;
  topInset: number;
  bottomInset: number;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
  onShowInChat: (messageId: string) => void;
};

export function GroupProfileMediaViewerModal({
  visible,
  mediaItems,
  selectedIndex,
  topInset,
  bottomInset,
  onClose,
  onChangeIndex,
  onShowInChat,
}: GroupProfileMediaViewerModalProps) {
  const { width: viewportWidth } = useWindowDimensions();
  const selectedMediaItem =
    selectedIndex != null ? mediaItems[selectedIndex] ?? null : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.content}>
          <View style={[styles.topBar, { paddingTop: topInset + 10 }]}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Feather name="x" size={22} color="#FFFFFF" />
            </Pressable>

            {selectedMediaItem ? (
              <View style={styles.counter}>
                <Text style={styles.counterText}>
                  {selectedIndex! + 1} / {mediaItems.length}
                </Text>
              </View>
            ) : (
              <View style={styles.counterSpacer} />
            )}
          </View>

          {selectedMediaItem ? (
            <FlatList
              key={`media-viewer-${selectedIndex}`}
              data={mediaItems}
              horizontal
              pagingEnabled
              initialScrollIndex={selectedIndex ?? 0}
              getItemLayout={(_, index) => ({
                length: viewportWidth,
                offset: viewportWidth * index,
                index,
              })}
              onMomentumScrollEnd={(event) => {
                const nextIndex = Math.round(
                  event.nativeEvent.contentOffset.x / Math.max(viewportWidth, 1)
                );
                if (nextIndex >= 0 && nextIndex < mediaItems.length) {
                  onChangeIndex(nextIndex);
                }
              }}
              renderItem={({ item }) => (
                <View style={[styles.slide, { width: viewportWidth }]}>
                  <Image source={{ uri: item.uri }} style={styles.image} resizeMode="contain" />
                </View>
              )}
              showsHorizontalScrollIndicator={false}
            />
          ) : null}

          {selectedMediaItem ? (
            <View style={[styles.bottomBar, { paddingBottom: Math.max(bottomInset, 16) }]}>
              <Pressable
                onPress={() => onShowInChat(selectedMediaItem.id)}
                style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
              >
                <Feather name="message-circle" size={18} color="#FFFFFF" />
                <Text style={styles.actionText}>Показать в чате</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(8, 12, 20, 0.96)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  counter: {
    minWidth: 68,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  counterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  counterSpacer: {
    width: 44,
    height: 44,
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  actionButton: {
    minHeight: 50,
    paddingHorizontal: 18,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  actionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.84,
  },
});

