import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';
import type { GalleryItem } from './InputAttachmentSheet';
import { CropOverlay } from './CropOverlay';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const CLOSE_SWIPE_DISTANCE = 100;
const EMPTY_EDITED_URIS = new Map<string, string>();

type GalleryPhotoPreviewProps = {
  visible: boolean;
  items: GalleryItem[];
  initialIndex: number;
  /** Map itemId → selection order (1-based). null = not selected. */
  selectedById: Map<string, number>;
  /** Shared caption value synced with gallery sheet */
  captionValue: string;
  onCaptionChange: (text: string) => void;
  onClose: () => void;
  onToggleSelect: (item: GalleryItem) => void;
  onSend: () => void;
  /** itemId → URI после обрезки/редактирования (для отправки в чат). */
  editedUris?: Map<string, string>;
  onEditedUriChange?: (itemId: string, uri: string) => void;
};

/* ─── single slide ─── */
const PreviewSlide = React.memo(function PreviewSlide({
  item,
  editedUri,
}: {
  item: GalleryItem;
  editedUri?: string;
}) {
  const uri = editedUri || item.localUri || item.uri;
  return (
    <View style={styles.slide}>
      <Image source={{ uri }} style={styles.media} resizeMode="contain" />
    </View>
  );
});

/* ─── main component ─── */
export const GalleryPhotoPreview = React.memo(function GalleryPhotoPreview({
  visible,
  items,
  initialIndex,
  selectedById,
  captionValue,
  onCaptionChange,
  onClose,
  onToggleSelect,
  onSend,
  editedUris,
  onEditedUriChange,
}: GalleryPhotoPreviewProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const listRef = useRef<FlatList<GalleryItem> | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [cropMode, setCropMode] = useState(false);
  const editedUriMap = editedUris ?? EMPTY_EDITED_URIS;

  /* keyboard-aware bottom offset */
  const keyboard = useAnimatedKeyboard();
  const bottomLiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboard.height.value }],
  }));

  /* reset when opening */
  useEffect(() => {
    if (!visible) return;
    translateY.setValue(0);
    setCurrentIndex(initialIndex);
    setCropMode(false);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
    });
  }, [visible, initialIndex, translateY]);

  /* backdrop opacity driven by vertical drag */
  const backdropOpacity = useMemo(
    () =>
      translateY.interpolate({
        inputRange: [-200, 0, 200],
        outputRange: [0.3, 1, 0.3],
        extrapolate: 'clamp',
      }),
    [translateY],
  );

  const resetPosition = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const closeFromSwipe = useCallback(
    (direction: number) => {
      Animated.timing(translateY, {
        toValue: direction >= 0 ? SCREEN_HEIGHT : -SCREEN_HEIGHT,
        duration: 160,
        useNativeDriver: true,
      }).start(onClose);
    },
    [onClose, translateY],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          !cropMode && Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.1,
        onMoveShouldSetPanResponder: (_, g) =>
          !cropMode && Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.1,
        onPanResponderMove: (_, g) => {
          translateY.setValue(g.dy);
        },
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dy) > CLOSE_SWIPE_DISTANCE || Math.abs(g.vy) > 0.9) {
            closeFromSwipe(g.dy || g.vy);
            return;
          }
          resetPosition();
        },
        onPanResponderTerminate: resetPosition,
        onPanResponderTerminationRequest: () => true,
      }),
    [closeFromSwipe, cropMode, resetPosition, translateY],
  );

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (next >= 0 && next < items.length) setCurrentIndex(next);
    },
    [items.length],
  );

  const renderItem = useCallback(
    ({ item }: { item: GalleryItem }) => (
      <PreviewSlide item={item} editedUri={editedUriMap.get(item.id)} />
    ),
    [editedUriMap],
  );

  const currentItem = items[currentIndex];
  const selectionOrder = currentItem ? selectedById.get(currentItem.id) ?? null : null;
  const isSelected = selectionOrder != null;
  const totalSelected = selectedById.size;
  const hasSelection = totalSelected > 0;

  if (!visible || items.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (cropMode) {
          setCropMode(false);
        } else {
          onClose();
        }
      }}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        {/* swipeable image area */}
        <Animated.View
          style={[styles.viewerRoot, { transform: [{ translateY }] }]}
          {...panResponder.panHandlers}
        >
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            bounces={false}
            removeClippedSubviews={false}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={initialIndex}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            onScrollToIndexFailed={({ index }) => {
              requestAnimationFrame(() => {
                listRef.current?.scrollToOffset({
                  offset: SCREEN_WIDTH * index,
                  animated: false,
                });
              });
            }}
            onMomentumScrollEnd={handleMomentumEnd}
            renderItem={renderItem}
          />
        </Animated.View>

        {/* ─── top bar: counter + selection circle ─── */}
        {!cropMode ? (
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          {/* counter */}
          <Text style={styles.counter}>
            {currentIndex + 1} / {items.length}
          </Text>

          {/* selection circle (top-right) */}
          <Pressable
            style={[styles.selectCircle, isSelected && styles.selectCircleActive]}
            onPress={() => currentItem && onToggleSelect(currentItem)}
            hitSlop={10}
          >
            {isSelected ? (
              <Text style={styles.selectCircleText}>{selectionOrder}</Text>
            ) : null}
          </Pressable>
        </View>
        ) : null}

        {/* ─── bottom area: caption bar + toolbar (keyboard-aware) ─── */}
        {!cropMode ? (
        <Reanimated.View
          style={[
            styles.bottomArea,
            { paddingBottom: Math.max(insets.bottom, 8) + 6 },
            bottomLiftStyle,
          ]}
          pointerEvents="box-none"
        >
          {/* caption input bar — only when something is selected */}
          {hasSelection ? (
            <View style={styles.captionRow}>
              <View style={styles.captionInputWrap}>
                <TextInput
                  value={captionValue}
                  onChangeText={onCaptionChange}
                  placeholder="Добавить подпись..."
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  style={styles.captionInput}
                  multiline
                  maxLength={1024}
                />
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.captionSendBtn,
                  { backgroundColor: colors.accent },
                  pressed && styles.captionSendBtnPressed,
                ]}
                onPress={onSend}
              >
                <Feather name="arrow-up" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : null}

          {/* toolbar row */}
          <View style={styles.toolbarRow}>
            {/* back button */}
            <Pressable
              style={({ pressed }) => [styles.toolBtn, pressed && styles.toolBtnPressed]}
              onPress={onClose}
              hitSlop={6}
            >
              <Feather name="chevron-left" size={28} color="#FFFFFF" />
            </Pressable>

            {/* crop */}
            <Pressable
              style={({ pressed }) => [styles.toolBtn, pressed && styles.toolBtnPressed]}
              onPress={() => setCropMode(true)}
              hitSlop={6}
            >
              <MaterialCommunityIcons name="crop" size={24} color="#FFFFFF" />
            </Pressable>

            {/* draw */}
            <Pressable
              style={({ pressed }) => [styles.toolBtn, pressed && styles.toolBtnPressed]}
              onPress={() => {
                /* TODO: open draw */
              }}
              hitSlop={6}
            >
              <MaterialCommunityIcons name="draw" size={24} color="#FFFFFF" />
            </Pressable>

            {/* spacer */}
            <View style={styles.toolSpacer} />

            {/* send / select-and-send button (only if no caption bar visible) */}
            {!hasSelection ? (
              <Pressable
                style={({ pressed }) => [
                  styles.sendBtn,
                  { backgroundColor: colors.accent },
                  pressed && styles.sendBtnPressed,
                ]}
                onPress={() => {
                  if (currentItem && !isSelected) onToggleSelect(currentItem);
                  onSend();
                }}
              >
                <Feather name="arrow-up" size={22} color="#FFFFFF" />
              </Pressable>
            ) : null}
          </View>
        </Reanimated.View>
        ) : null}

        {/* ─── Crop overlay ─── */}
        {cropMode && currentItem ? (
          <CropOverlay
            uri={editedUriMap.get(currentItem.id) || currentItem.localUri || currentItem.uri}
            onConfirm={(croppedUri) => {
              onEditedUriChange?.(currentItem.id, croppedUri);
              setCropMode(false);
            }}
            onCancel={() => setCropMode(false)}
          />
        ) : null}
      </Animated.View>
    </Modal>
  );
});

/* ─── styles ─── */
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  viewerRoot: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  slide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  media: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },

  /* top bar */
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 50,
  },
  counter: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.35)',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  selectCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectCircleActive: {
    borderColor: '#3390EC',
    backgroundColor: '#3390EC',
  },
  selectCircleText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* bottom area (keyboard-aware container) */
  bottomArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },

  /* caption input row */
  captionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: 10,
    marginBottom: 8,
    gap: 8,
  },
  captionInputWrap: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 16,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  captionInput: {
    fontSize: 16,
    lineHeight: 20,
    color: '#FFFFFF',
    maxHeight: 100,
    paddingTop: 10,
    paddingBottom: 10,
  },
  captionSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionSendBtnPressed: {
    opacity: 0.82,
  },

  /* toolbar row */
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 12,
  },
  toolBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnPressed: {
    opacity: 0.6,
  },
  toolSpacer: {
    flex: 1,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnPressed: {
    opacity: 0.82,
  },
});
