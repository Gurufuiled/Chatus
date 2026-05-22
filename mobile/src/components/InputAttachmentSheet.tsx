import React from 'react';
import { GalleryPhotoPreview } from './GalleryPhotoPreview';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FlatList as GestureHandlerFlatList,
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Reanimated, {
  Extrapolation,
  interpolate,
  runOnJS,
  scrollTo,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Image } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';
import { formatMediaDuration } from '../utils/mediaDuration';
import { GallerySkeletonGrid } from './GallerySkeletonGrid';
import {
  ensureVideoThumbnailUri,
  getCachedVideoThumbnailUri,
} from '../utils/videoThumbnail';

export type GalleryItem = {
  id: string;
  kind: 'image' | 'video';
  uri: string;
  localUri?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  fileName?: string;
};

type AttachmentAction = {
  key: string;
  title: string;
  tone: 'file' | 'video';
  onPress: () => Promise<void>;
};

export type GallerySheetVariant = 'attachment' | 'avatar';

export type GallerySheetBottomButton = {
  label: string;
  onPress: () => void | Promise<void>;
};

type InputAttachmentSheetProps = {
  visible: boolean;
  /** attachment — чат/вложения; avatar — выбор одного фото (профиль, канал, группа). */
  variant?: GallerySheetVariant;
  headerSubtitle?: string;
  galleryEnabled: boolean;
  galleryItems: GalleryItem[];
  galleryLoading: boolean;
  galleryDenied: boolean;
  /** Текст при отказе в доступе к медиатеке (по умолчанию — фото и видео). */
  galleryDeniedHint?: string;
  attachmentActions: AttachmentAction[];
  selectedItems: GalleryItem[];
  captionValue: string;
  onClose: () => void;
  onToggleGalleryItem: (item: GalleryItem) => void;
  onCaptionChange: (text: string) => void;
  onSendSelected: () => void;
  onRunAttachmentAction: (action: () => Promise<void>) => void;
  /** Нижняя кнопка вместо дока режимов (например «Все фото…» для аватара). */
  bottomButton?: GallerySheetBottomButton;
  galleryInteractDisabled?: boolean;
  /** URI после обрезки в превью (itemId → file://…). */
  editedUris?: Map<string, string>;
  onEditedUriChange?: (itemId: string, uri: string) => void;
};

function createAttachmentSheetStyles(c: ThemeColors) {
  const shadow = withAlpha('#000000', 0.35);
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdropFill: { flex: 1, backgroundColor: '#000000' },
    sheet: {
      backgroundColor: c.inputBackgroundSolid,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      overflow: 'hidden',
      shadowColor: shadow,
      shadowOpacity: 0.22,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: -10 },
      elevation: 12,
    },
    handleArea: { paddingTop: 8 },
    handlePill: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.separator,
      marginBottom: 4,
    },
    sheetHeader: {
      height: 52,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      gap: 10,
    },
    headerCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.rowPressed,
    },
    selectedPill: {
      height: 42,
      minWidth: 58,
      paddingHorizontal: 12,
      borderRadius: 21,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      backgroundColor: c.accent,
    },
    selectedPillText: { fontSize: 16, fontWeight: '800', color: c.textSecondaryMuted },
    titlePill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
    sheetTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    sheetSubtitle: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
      textAlign: 'center',
    },
    headerSpacer: { width: 42, height: 42 },
    flex: { flex: 1 },
    galleryGrid: { paddingBottom: 78 },
    galleryRow: { gap: 1, marginBottom: 1 },
    galleryCellOuter: { flex: 1 },
    galleryCell: { aspectRatio: 1, overflow: 'hidden', backgroundColor: c.placeholderBg },
    galleryImage: { width: '100%', height: '100%' },
    galleryVideoFallback: {
      flex: 1,
      backgroundColor: c.chatBackground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    galleryVideoOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: withAlpha(c.textPrimary, 0.06),
    },
    galleryVideoBadge: {
      position: 'absolute',
      right: 7,
      bottom: 7,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: withAlpha('#000000', 0.62),
    },
    galleryVideoPlayIcon: { marginLeft: 1 },
    galleryVideoBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
    selectCircle: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.7,
      borderColor: withAlpha('#FFFFFF', 0.9),
      backgroundColor: withAlpha('#000000', 0.32),
    },
    selectCircleSelected: { borderColor: c.accent, backgroundColor: c.accent },
    selectCircleText: { fontSize: 13, fontWeight: '800', color: c.textSecondaryMuted },
    galleryPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 26,
    },
    galleryHint: { fontSize: 15, lineHeight: 21, color: c.textSecondary, textAlign: 'center' },
    bottomAccessory: { position: 'absolute', left: 16, right: 16 },
    modeDock: {
      minHeight: 58,
      borderRadius: 22,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: c.composerSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      shadowColor: shadow,
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 7,
    },
    modeAction: {
      minWidth: 72,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 16,
    },
    modeActionActive: { backgroundColor: withAlpha(c.accent, 0.14) },
    modeActionLabel: { marginTop: 3, fontSize: 12, fontWeight: '700', color: c.textSecondary },
    modeActionLabelActive: { color: c.accent },
    captionBar: {
      minHeight: 56,
      borderRadius: 24,
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingLeft: 15,
      paddingRight: 7,
      paddingVertical: 7,
      backgroundColor: c.composerSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      shadowColor: shadow,
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    captionInput: {
      flex: 1,
      maxHeight: 92,
      minHeight: 42,
      paddingTop: 11,
      paddingBottom: 9,
      paddingHorizontal: 0,
      fontSize: 16,
      lineHeight: 20,
      color: c.textPrimary,
    },
    sendBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      marginLeft: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
    },
    bottomPrimaryBtn: {
      minHeight: 54,
      borderRadius: 22,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 16,
      backgroundColor: c.buttonBackground,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      shadowColor: shadow,
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 7,
    },
    bottomPrimaryBtnPressed: { opacity: 0.88 },
    bottomPrimaryBtnLabel: { fontSize: 15, fontWeight: '800', color: c.accent },
  });
}

type AttachmentSheetStyles = ReturnType<typeof createAttachmentSheetStyles>;

function SheetActionIcon({ tone, iconColor }: { tone: AttachmentAction['tone']; iconColor: string }) {
  if (tone === 'video') {
    return <MaterialCommunityIcons name="play-circle-outline" size={21} color={iconColor} />;
  }
  return <Feather name="file-text" size={19} color={iconColor} />;
}

const AnimatedGalleryFlatList = Reanimated.createAnimatedComponent(GestureHandlerFlatList<GalleryItem>);

const GalleryCell = React.memo(function GalleryCell({
  item,
  selectedIndex,
  onToggle,
  onPreview,
  styles,
  iconMuted,
  showSelectionBadge,
  disabled,
}: {
  item: GalleryItem;
  selectedIndex: number | null;
  onToggle: (item: GalleryItem) => void;
  onPreview?: (item: GalleryItem) => void;
  styles: AttachmentSheetStyles;
  iconMuted: string;
  showSelectionBadge: boolean;
  disabled?: boolean;
}) {
  const [thumbnailUri, setThumbnailUri] = React.useState(() =>
    item.kind === 'video' ? getCachedVideoThumbnailUri(item.uri) ?? '' : ''
  );

  React.useEffect(() => {
    if (item.kind !== 'video') {
      setThumbnailUri('');
      return;
    }
    const cached = getCachedVideoThumbnailUri(item.uri);
    if (cached) { setThumbnailUri(cached); return; }
    let cancelled = false;
    void ensureVideoThumbnailUri(item.uri)
      .then((uri) => { if (!cancelled) setThumbnailUri(uri); })
      .catch(() => { if (!cancelled) setThumbnailUri(''); });
    return () => { cancelled = true; };
  }, [item.kind, item.uri]);

  const previewUri = item.kind === 'video' ? thumbnailUri : (item.localUri || item.uri);
  const isSelected = selectedIndex != null;

  return (
    <View style={styles.galleryCellOuter}>
      <Pressable
        style={styles.galleryCell}
        disabled={disabled}
        onPress={() => (onPreview ? onPreview(item) : onToggle(item))}
      >
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={styles.galleryImage} resizeMode="cover" />
        ) : (
          <View style={styles.galleryVideoFallback}>
            <MaterialCommunityIcons name="movie-open-play-outline" size={28} color={iconMuted} />
          </View>
        )}
        {item.kind === 'video' ? (
          <>
            <View style={styles.galleryVideoOverlay} />
            <View style={styles.galleryVideoBadge}>
              <Feather name="play" size={11} color="#FFFFFF" style={styles.galleryVideoPlayIcon} />
              <Text style={styles.galleryVideoBadgeText}>{formatMediaDuration(item.durationMs ?? 0)}</Text>
            </View>
          </>
        ) : null}
        {showSelectionBadge ? (
          <Pressable
            style={[styles.selectCircle, isSelected && styles.selectCircleSelected]}
            onPress={(e) => {
              e.stopPropagation();
              onToggle(item);
            }}
            hitSlop={6}
          >
            {isSelected ? <Text style={styles.selectCircleText}>{selectedIndex}</Text> : null}
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
});

const SCREEN_HEIGHT = Dimensions.get('window').height;
const COLLAPSED_H = Math.round(SCREEN_HEIGHT * 0.58);
const SPRING_CFG = { damping: 26, stiffness: 280, mass: 0.88 } as const;
const CLOSE_VELOCITY_Y = 900;
const EXPAND_VELOCITY_Y = -900;
/** sheetTranslateY below this = fully expanded (grid may scroll). */
const SHEET_EXPANDED_EPS = 6;
const SCROLL_AT_TOP_EPS = 8;
const SCROLL_ENABLE_TY = 3;
const SCROLL_DISABLE_TY = 48;

function clampSheetTranslateY(value: number, maxTranslate: number): number {
  'worklet';
  return Math.max(0, Math.min(maxTranslate, value));
}

export const InputAttachmentSheet = React.memo(function InputAttachmentSheet({
  visible,
  variant = 'attachment',
  headerSubtitle,
  galleryEnabled,
  galleryItems,
  galleryLoading,
  galleryDenied,
  galleryDeniedHint,
  attachmentActions,
  selectedItems,
  captionValue,
  onClose,
  onToggleGalleryItem,
  onCaptionChange,
  onSendSelected,
  onRunAttachmentAction,
  bottomButton,
  galleryInteractDisabled = false,
  editedUris,
  onEditedUriChange,
}: InputAttachmentSheetProps) {
  const isAvatarVariant = variant === 'avatar';
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createAttachmentSheetStyles(colors), [colors]);
  const expandedH = Math.round(SCREEN_HEIGHT - insets.top);
  const collapsedTranslateY = Math.max(0, expandedH - COLLAPSED_H);

  // 0 = полный экран, collapsedTranslateY = ~58%, expandedH = закрыто
  const sheetTranslateY = useSharedValue(collapsedTranslateY);
  const scrollY = useSharedValue(0);
  const dragStartTranslateY = useSharedValue(collapsedTranslateY);
  const maxTranslateY = useSharedValue(expandedH);
  const snapCollapsedY = useSharedValue(collapsedTranslateY);

  React.useEffect(() => {
    maxTranslateY.value = expandedH;
    snapCollapsedY.value = collapsedTranslateY;
  }, [collapsedTranslateY, expandedH, maxTranslateY, snapCollapsedY]);

  const [shouldClose, setShouldClose] = React.useState(false);
  const [galleryOpenEpoch, setGalleryOpenEpoch] = React.useState(0);
  const listRef = useAnimatedRef<React.ComponentRef<typeof AnimatedGalleryFlatList>>();
  const gridPanRef = React.useRef<any>(null);
  const listScrollEnabled = useSharedValue(false);
  const lastTranslationYGrid = useSharedValue(0);
  const lastTranslationYHeader = useSharedValue(0);

  React.useEffect(() => {
    if (shouldClose) {
      setShouldClose(false);
      onClose();
    }
  }, [shouldClose, onClose]);

  const resetGalleryScrollPosition = React.useCallback(() => {
    scrollY.value = 0;
    scrollTo(listRef, 0, 0, false);
  }, [listRef, scrollY]);

  React.useEffect(() => {
    if (visible) {
      setGalleryOpenEpoch((n) => n + 1);
      scrollY.value = 0;
      listScrollEnabled.value = false;
      sheetTranslateY.value = expandedH;
      sheetTranslateY.value = withSpring(collapsedTranslateY, SPRING_CFG);
      return undefined;
    }
    sheetTranslateY.value = collapsedTranslateY;
    scrollY.value = 0;
    listScrollEnabled.value = false;
    return undefined;
  }, [
    visible,
    collapsedTranslateY,
    expandedH,
    listScrollEnabled,
    scrollY,
    sheetTranslateY,
  ]);

  React.useEffect(() => {
    if (!visible || galleryOpenEpoch === 0) {
      return undefined;
    }
    scrollY.value = 0;
    const raf = requestAnimationFrame(() => {
      resetGalleryScrollPosition();
    });
    const timer = setTimeout(resetGalleryScrollPosition, 100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [galleryOpenEpoch, resetGalleryScrollPosition, scrollY, visible]);

  const requestClose = React.useCallback(() => {
    setShouldClose(true);
  }, []);

  useAnimatedReaction(
    () => sheetTranslateY.value,
    (ty, prev) => {
      if (prev == null) {
        listScrollEnabled.value = ty <= SCROLL_ENABLE_TY;
        return;
      }
      if (!listScrollEnabled.value && ty <= SCROLL_ENABLE_TY) {
        listScrollEnabled.value = true;
      } else if (listScrollEnabled.value && ty >= SCROLL_DISABLE_TY) {
        listScrollEnabled.value = false;
      }
    },
    [listScrollEnabled],
  );

  const [isFullyExpanded, setIsFullyExpanded] = React.useState(false);

  useAnimatedReaction(
    () => listScrollEnabled.value,
    (enabled, prev) => {
      if (enabled !== prev) {
        runOnJS(setIsFullyExpanded)(enabled);
      }
    },
    [setIsFullyExpanded],
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = Math.max(0, event.contentOffset.y);
    },
  });

  const listAnimatedProps = useAnimatedProps(() => ({
    scrollEnabled: listScrollEnabled.value,
    bounces: listScrollEnabled.value,
  }));

  const settleSheetPosition = (velocityY: number, ty: number) => {
    'worklet';
    const maxTy = maxTranslateY.value;
    const snapCollapsed = snapCollapsedY.value;
    const closeThreshold = snapCollapsed + (maxTy - snapCollapsed) * 0.32;

    if (velocityY > CLOSE_VELOCITY_Y || ty >= closeThreshold) {
      sheetTranslateY.value = withTiming(maxTy, { duration: 200, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) {
          runOnJS(requestClose)();
        }
      });
      return;
    }

    const distToExpanded = ty;
    const distToCollapsed = Math.abs(ty - snapCollapsed);
    const preferExpanded = velocityY < EXPAND_VELOCITY_Y || distToExpanded < distToCollapsed;
    const nextScrollEnabled = preferExpanded;
    sheetTranslateY.value = withSpring(preferExpanded ? 0 : snapCollapsed, SPRING_CFG, (finished) => {
      if (finished) {
        listScrollEnabled.value = nextScrollEnabled;
      }
    });
  };

  const headerSheetPan = React.useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .activeOffsetY([-5, 5])
        .failOffsetX([-22, 22])
        .onBegin(() => {
          dragStartTranslateY.value = sheetTranslateY.value;
          lastTranslationYHeader.value = 0;
        })
        .onUpdate((e) => {
          const deltaY = e.translationY - lastTranslationYHeader.value;
          lastTranslationYHeader.value = e.translationY;

          const maxTy = maxTranslateY.value;
          sheetTranslateY.value = clampSheetTranslateY(sheetTranslateY.value + deltaY, maxTy);

          if (sheetTranslateY.value <= SCROLL_ENABLE_TY) {
            if (!listScrollEnabled.value) {
              listScrollEnabled.value = true;
            }
          } else {
            if (listScrollEnabled.value) {
              listScrollEnabled.value = false;
            }
          }
        })
        .onEnd((e) => {
          settleSheetPosition(e.velocityY, sheetTranslateY.value);
        }),
    [
      dragStartTranslateY,
      listScrollEnabled,
      maxTranslateY,
      sheetTranslateY,
      lastTranslationYHeader,
    ]
  );

  const gridSheetPan = React.useMemo(
    () => {
      const g = Gesture.Pan()
        .withRef(gridPanRef)
        .maxPointers(1)
        .failOffsetX([-22, 22]);

      if (isFullyExpanded) {
        g.activeOffsetY([5, 9999]).failOffsetY([-9999, -15]);
      } else {
        g.activeOffsetY([-5, 5]);
      }

      return g
        .onBegin(() => {
          dragStartTranslateY.value = sheetTranslateY.value;
          lastTranslationYGrid.value = 0;
        })
        .onUpdate((e) => {
          const expanded = sheetTranslateY.value <= SHEET_EXPANDED_EPS;

          // If expanded, list is scrolled down, and dragging down: let list scroll, do not drag sheet
          if (expanded && scrollY.value > SCROLL_AT_TOP_EPS && e.translationY > 0) {
            return;
          }

          // If expanded and dragging up: let list scroll, do not drag sheet
          if (expanded && e.translationY < 0) {
            return;
          }

          const deltaY = e.translationY - lastTranslationYGrid.value;
          lastTranslationYGrid.value = e.translationY;

          const maxTy = maxTranslateY.value;
          sheetTranslateY.value = clampSheetTranslateY(sheetTranslateY.value + deltaY, maxTy);

          if (sheetTranslateY.value <= SCROLL_ENABLE_TY) {
            if (!listScrollEnabled.value) {
              listScrollEnabled.value = true;
            }
          } else {
            if (listScrollEnabled.value) {
              listScrollEnabled.value = false;
            }
          }
        })
        .onEnd((e) => {
          settleSheetPosition(e.velocityY, sheetTranslateY.value);
        });
    },
    [
      isFullyExpanded,
      dragStartTranslateY,
      listScrollEnabled,
      maxTranslateY,
      scrollY,
      sheetTranslateY,
      lastTranslationYGrid,
    ]
  );

  const sheetInnerStyle = useAnimatedStyle(() => ({
    height: expandedH,
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => {
    const maxTy = maxTranslateY.value;
    const visible = maxTy - sheetTranslateY.value;
    return {
      opacity: interpolate(visible, [0, COLLAPSED_H, expandedH], [0, 0.38, 0.52], Extrapolation.CLAMP),
    };
  });

  // --- Gallery helpers ---
  const selectedById = React.useMemo(() => {
    const map = new Map<string, number>();
    selectedItems.forEach((item, i) => map.set(item.id, i + 1));
    return map;
  }, [selectedItems]);

  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null);

  const handlePreviewPhoto = React.useCallback(
    (item: GalleryItem) => {
      const idx = galleryItems.findIndex((g) => g.id === item.id);
      if (idx >= 0) setPreviewIndex(idx);
    },
    [galleryItems],
  );

  const closePreview = React.useCallback(() => setPreviewIndex(null), []);

  const keyExtractor = React.useCallback((item: GalleryItem) => item.id, []);

  const renderItem = React.useCallback(
    ({ item }: { item: GalleryItem }) => (
      <GalleryCell
        item={item}
        selectedIndex={selectedById.get(item.id) ?? null}
        onToggle={onToggleGalleryItem}
        onPreview={isAvatarVariant ? undefined : handlePreviewPhoto}
        styles={styles}
        iconMuted={colors.iconMuted}
        showSelectionBadge={!isAvatarVariant}
        disabled={galleryInteractDisabled}
      />
    ),
    [colors.iconMuted, galleryInteractDisabled, handlePreviewPhoto, isAvatarVariant, onToggleGalleryItem, selectedById, styles],
  );

  const hasSelection = !isAvatarVariant && selectedItems.length > 0;
  const deniedHint =
    galleryDeniedHint ??
    (isAvatarVariant
      ? 'Нужен доступ к фото, чтобы показать недавние снимки.'
      : 'Нужен доступ к фото и видео.');
  const emptyHint = isAvatarVariant ? 'В галерее устройства пока нет фото.' : 'Медиа не найдены.';

  const galleryList = (
    <AnimatedGalleryFlatList
      key={`gallery-${galleryOpenEpoch}`}
      ref={listRef}
      simultaneousHandlers={gridPanRef}
      animatedProps={listAnimatedProps}
      data={galleryItems}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      numColumns={3}
      style={styles.flex}
      contentContainerStyle={[styles.galleryGrid, { paddingBottom: hasSelection ? 74 : 78 }]}
      columnWrapperStyle={styles.galleryRow}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews
      overScrollMode="never"
      bounces={false}
      initialNumToRender={18}
      maxToRenderPerBatch={12}
      windowSize={5}
      updateCellsBatchingPeriod={40}
      keyboardShouldPersistTaps="handled"
      onScroll={scrollHandler}
      scrollEventThrottle={16}
    />
  );

  return (
    <>
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Reanimated.View pointerEvents="none" style={[styles.backdropFill, backdropStyle]} />
        </Pressable>

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: expandedH,
            overflow: 'hidden',
          }}
        >
          <Reanimated.View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 8) + 10 },
              sheetInnerStyle,
            ]}
          >
            <GestureDetector gesture={headerSheetPan}>
              <View style={styles.handleArea}>
                <View style={styles.handlePill} />
                <View style={styles.sheetHeader}>
                  <Pressable style={styles.headerCircle} onPress={onClose} hitSlop={8}>
                    <Feather name="x" size={24} color={colors.textPrimary} />
                  </Pressable>

                  {hasSelection ? (
                    <View style={styles.selectedPill}>
                      <Feather name="check" size={16} color={colors.textSecondaryMuted} />
                      <Text style={styles.selectedPillText}>{selectedItems.length}</Text>
                    </View>
                  ) : isAvatarVariant ? (
                    <View style={styles.headerSpacer} />
                  ) : null}

                  <View style={styles.titlePill}>
                    <Text style={styles.sheetTitle}>Недавние</Text>
                    {headerSubtitle ? (
                      <Text style={styles.sheetSubtitle} numberOfLines={1}>
                        {headerSubtitle}
                      </Text>
                    ) : null}
                  </View>

                  {isAvatarVariant ? (
                    <View style={styles.headerSpacer} />
                  ) : (
                    <Pressable style={styles.headerCircle} hitSlop={8}>
                      <Feather name="more-horizontal" size={24} color={colors.textPrimary} />
                    </Pressable>
                  )}
                </View>
              </View>
            </GestureDetector>

            <View style={styles.flex}>
              {galleryEnabled ? (
                galleryLoading ? (
                  <GallerySkeletonGrid rows={4} />
                ) : galleryDenied ? (
                  <View style={styles.galleryPlaceholder}>
                    <Text style={styles.galleryHint}>{deniedHint}</Text>
                  </View>
                ) : galleryItems.length > 0 ? (
                  <GestureDetector gesture={gridSheetPan}>
                    {galleryList}
                  </GestureDetector>
                ) : (
                  <View style={styles.galleryPlaceholder}>
                    <Text style={styles.galleryHint}>{emptyHint}</Text>
                  </View>
                )
              ) : null}
            </View>

              {/* Bottom dock внутри движущейся шторки */}
              <View
                pointerEvents="box-none"
                style={[styles.bottomAccessory, { bottom: Math.max(insets.bottom, 8) + 8 }]}
              >
                {hasSelection ? (
                  <View style={styles.captionBar}>
                    <TextInput
                      value={captionValue}
                      onChangeText={onCaptionChange}
                      placeholder="Добавить подпись..."
                      placeholderTextColor={colors.placeholder}
                      style={styles.captionInput}
                      multiline
                    />
                    <Pressable style={styles.sendBtn} onPress={onSendSelected}>
                      <Feather name="send" size={20} color={colors.textSecondaryMuted} />
                    </Pressable>
                  </View>
                ) : bottomButton ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.bottomPrimaryBtn,
                      pressed && styles.bottomPrimaryBtnPressed,
                    ]}
                    onPress={() => {
                      void Promise.resolve(bottomButton.onPress());
                    }}
                    disabled={galleryInteractDisabled}
                  >
                    <MaterialCommunityIcons name="folder-image" size={22} color={colors.accent} />
                    <Text style={styles.bottomPrimaryBtnLabel}>{bottomButton.label}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.modeDock}>
                    <View style={[styles.modeAction, styles.modeActionActive]}>
                      <MaterialCommunityIcons name="image-multiple" size={22} color={colors.accent} />
                      <Text style={[styles.modeActionLabel, styles.modeActionLabelActive]}>Галерея</Text>
                    </View>
                    {attachmentActions.map((action) => (
                      <Pressable
                        key={action.key}
                        style={styles.modeAction}
                        onPress={() => onRunAttachmentAction(action.onPress)}
                      >
                        <SheetActionIcon tone={action.tone} iconColor={colors.iconMuted} />
                        <Text style={styles.modeActionLabel}>{action.title}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
          </Reanimated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>

      <GalleryPhotoPreview
        visible={previewIndex != null}
        items={galleryItems}
        initialIndex={previewIndex ?? 0}
        selectedById={selectedById}
        captionValue={captionValue}
        editedUris={editedUris}
        onEditedUriChange={onEditedUriChange}
        onCaptionChange={onCaptionChange}
        onClose={closePreview}
        onToggleSelect={onToggleGalleryItem}
        onSend={() => {
          closePreview();
          onSendSelected();
        }}
      />
    </>
  );
});
