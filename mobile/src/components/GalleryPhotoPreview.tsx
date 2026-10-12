import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Reanimated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { useTheme } from "../contexts/ThemeContext";
import type { GalleryItem } from "./InputAttachmentSheet";
import { useModalKeyboardHeight } from "../utils/useModalKeyboardHeight";
import { CropOverlay } from "./CropOverlay";
import { DrawingOverlay } from "./DrawingOverlay";
import { useHeroDismiss } from "../hooks/useHeroDismiss";
import { HeroOverlay } from "./HeroOverlay";
import { measureMediaThumb } from "../utils/mediaThumbRegistry";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
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
  /** Sends the current photo directly, or the existing selection when omitted. */
  onSend: (item?: GalleryItem) => void;
  /** itemId → URI после обрезки/редактирования (для отправки в чат). */
  editedUris?: Map<string, string>;
  onEditedUriChange?: (
    itemId: string,
    uri: string,
    size?: { width: number; height: number },
  ) => void;
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
      {/* ⚡ Bolt: Using expo-image with disk cache and contentFit for smoother rendering */}
      <Image
        source={{ uri }}
        style={styles.media}
        contentFit="contain"
        cachePolicy="disk"
      />
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
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const currentIndexRef = useRef(initialIndex);
  const [cropMode, setCropMode] = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);
  const editedUriMap = editedUris ?? EMPTY_EDITED_URIS;

  /* keyboard-aware bottom offset */
  const keyboard = useAnimatedKeyboard();
  const modalKeyboardHeight = useModalKeyboardHeight(visible);
  const bottomLiftStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: -Math.max(keyboard.height.value, modalKeyboardHeight.value, 0),
      },
    ],
  }));

  /* reset when opening */
  useEffect(() => {
    if (!visible) return;
    currentIndexRef.current = initialIndex;
    setCurrentIndex(initialIndex);
    setCropMode(false);
    setDrawingMode(false);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
    });
  }, [visible, initialIndex]);

  /* закрытие свайпом: фото возвращается на место миниатюры (как в Telegram) */
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const getSourceRect = useCallback(
    () => measureMediaThumb(itemsRef.current[currentIndexRef.current]?.id),
    [],
  );
  const editedUriMapRef = useRef(editedUriMap);
  editedUriMapRef.current = editedUriMap;
  const getHeroImageUri = useCallback(() => {
    const current = itemsRef.current[currentIndexRef.current];
    if (!current) return null;
    return editedUriMapRef.current.get(current.id) || current.localUri || current.uri;
  }, []);
  const getImageSize = useCallback(() => {
    const current = itemsRef.current[currentIndexRef.current];
    if (!current?.width || !current?.height) return null;
    return { width: current.width, height: current.height };
  }, []);
  const hero = useHeroDismiss({
    visible,
    enabled: !cropMode && !drawingMode,
    getSourceRect,
    getHeroImageUri,
    getImageSize,
    onDismiss: onClose,
  });

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (next >= 0 && next < items.length) {
        currentIndexRef.current = next;
        setCurrentIndex(next);
      }
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
  const selectionOrder = currentItem
    ? (selectedById.get(currentItem.id) ?? null)
    : null;
  const isSelected = selectionOrder != null;
  const totalSelected = selectedById.size;
  const hasSelection = totalSelected > 0;

  const runToolAction = useCallback((action: () => void) => {
    void Haptics.selectionAsync().catch(() => undefined);
    action();
  }, []);

  if (!visible || items.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {
        if (cropMode) {
          setCropMode(false);
        } else if (drawingMode) {
          setDrawingMode(false);
        } else {
          hero.requestClose();
        }
      }}
    >
      <GestureHandlerRootView style={styles.backdrop}>
        <Reanimated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.backdropFill, hero.backdropStyle]}
        />

        {/* swipeable image area */}
        <GestureDetector gesture={hero.gesture}>
         <Reanimated.View style={[styles.viewerRoot, hero.contentStyle]}>
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
         </Reanimated.View>
        </GestureDetector>

        <HeroOverlay hero={hero} />

        {/* панели тают вместе с фоном при перетаскивании */}
        <Reanimated.View
          style={[StyleSheet.absoluteFill, hero.chromeStyle]}
          pointerEvents="box-none"
        >
        {/* ─── top bar: counter + selection circle ─── */}
        {!cropMode && !drawingMode ? (
          <View
            style={[styles.topBar, { paddingTop: insets.top + 8 }]}
            pointerEvents="box-none"
          >
            {/* counter */}
            <Text style={styles.counter}>
              {currentIndex + 1} / {items.length}
            </Text>

            {/* selection circle (top-right) */}
            <Pressable
              style={[
                styles.selectCircle,
                isSelected && styles.selectCircleActive,
              ]}
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
        {!cropMode && !drawingMode ? (
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
                  onPress={() => runToolAction(() => onSend())}
                  accessibilityRole="button"
                  accessibilityLabel="Отправить выбранные фото"
                >
                  <Feather name="arrow-up" size={22} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : null}

            {/* toolbar row */}
            <View style={styles.toolbarDock}>
              <View style={styles.toolbarRow}>
                {/* back button */}
                <Pressable
                  style={({ pressed }) => [
                    styles.toolBtn,
                    pressed && styles.toolBtnPressed,
                  ]}
                  onPress={() => runToolAction(hero.requestClose)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Назад в галерею"
                >
                  <Feather name="chevron-left" size={28} color="#FFFFFF" />
                </Pressable>

                {/* crop */}
                <Pressable
                  style={({ pressed }) => [
                    styles.toolBtn,
                    pressed && styles.toolBtnPressed,
                  ]}
                  onPress={() => runToolAction(() => setCropMode(true))}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Обрезать фото"
                >
                  <MaterialCommunityIcons name="crop" size={24} color="#FFFFFF" />
                </Pressable>

                {/* draw */}
                <Pressable
                  style={({ pressed }) => [
                    styles.toolBtn,
                    pressed && styles.toolBtnPressed,
                  ]}
                  onPress={() => runToolAction(() => setDrawingMode(true))}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Рисовать на фото"
                >
                  <MaterialCommunityIcons name="draw" size={24} color="#FFFFFF" />
                </Pressable>

                {/* send / select-and-send button (only if no caption bar visible) */}
                {!hasSelection ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.sendBtn,
                      { backgroundColor: colors.accent },
                      pressed && styles.sendBtnPressed,
                    ]}
                    onPress={() => {
                      if (!currentItem) return;
                      runToolAction(() => onSend(currentItem));
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Отправить фото"
                  >
                    <Feather name="arrow-up" size={22} color="#FFFFFF" />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </Reanimated.View>
        ) : null}

        </Reanimated.View>

        {/* ─── Crop overlay ─── */}
        {cropMode && currentItem ? (
          <CropOverlay
            uri={
              editedUriMap.get(currentItem.id) ||
              currentItem.localUri ||
              currentItem.uri
            }
            onConfirm={(croppedUri, size) => {
              onEditedUriChange?.(currentItem.id, croppedUri, size);
              setCropMode(false);
            }}
            onCancel={() => setCropMode(false)}
          />
        ) : null}

        {drawingMode && currentItem ? (
          <DrawingOverlay
            uri={
              editedUriMap.get(currentItem.id) ||
              currentItem.localUri ||
              currentItem.uri
            }
            onConfirm={(drawnUri, size) => {
              onEditedUriChange?.(currentItem.id, drawnUri, size);
              setDrawingMode(false);
            }}
            onCancel={() => setDrawingMode(false)}
          />
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
});

/* ─── styles ─── */
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  backdropFill: {
    backgroundColor: "#000000",
  },
  viewerRoot: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  slide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  media: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },

  /* top bar */
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 50,
  },
  counter: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.35)",
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  selectCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectCircleActive: {
    borderColor: "#3390EC",
    backgroundColor: "#3390EC",
  },
  selectCircleText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  /* bottom area (keyboard-aware container) */
  bottomArea: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },

  /* caption input row */
  captionRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginHorizontal: 10,
    marginBottom: 8,
    gap: 8,
  },
  captionInputWrap: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 16,
    paddingVertical: 4,
    justifyContent: "center",
  },
  captionInput: {
    fontSize: 16,
    lineHeight: 20,
    color: "#FFFFFF",
    maxHeight: 100,
    paddingTop: 10,
    paddingBottom: 10,
  },
  captionSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  captionSendBtnPressed: {
    opacity: 0.82,
  },

  /* toolbar row */
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 8,
  },
  toolbarDock: {
    // капсула по ширине содержимого и по центру: кнопки рядом, без пустого промежутка
    alignSelf: "center",
    marginHorizontal: 8,
    borderRadius: 30,
    backgroundColor: "rgba(14,18,24,0.86)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: "#000000",
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
  },
  toolBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
  toolBtnPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.94 }],
  },
});
