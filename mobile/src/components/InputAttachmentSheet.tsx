import React from 'react';
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
import { Gesture, GestureDetector, NativeViewGestureHandler } from 'react-native-gesture-handler';
import Reanimated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Image } from 'react-native';
import { formatMediaDuration } from '../utils/mediaDuration';
import { GallerySkeletonGrid } from './GallerySkeletonGrid';
import {
  ensureVideoThumbnailUri,
  getCachedVideoThumbnailUri,
} from '../utils/videoThumbnail';

type GalleryItem = {
  id: string;
  kind: 'image' | 'video';
  uri: string;
  localUri?: string;
  width?: number;
  height?: number;
  durationMs?: number;
};

type AttachmentAction = {
  key: string;
  title: string;
  tone: 'file' | 'video';
  onPress: () => Promise<void>;
};

type InputAttachmentSheetProps = {
  visible: boolean;
  galleryEnabled: boolean;
  galleryItems: GalleryItem[];
  galleryLoading: boolean;
  galleryDenied: boolean;
  attachmentActions: AttachmentAction[];
  selectedItems: GalleryItem[];
  captionValue: string;
  onClose: () => void;
  onToggleGalleryItem: (item: GalleryItem) => void;
  onCaptionChange: (text: string) => void;
  onSendSelected: () => void;
  onRunAttachmentAction: (action: () => Promise<void>) => void;
};

function SheetActionIcon({ tone }: { tone: AttachmentAction['tone'] }) {
  if (tone === 'video') {
    return <MaterialCommunityIcons name="play-circle-outline" size={21} color="#5F6875" />;
  }
  return <Feather name="file-text" size={19} color="#5F6875" />;
}

const AnimatedFlatList = Reanimated.createAnimatedComponent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  require('react-native').FlatList
);

const GalleryCell = React.memo(function GalleryCell({
  item,
  selectedIndex,
  onToggle,
}: {
  item: GalleryItem;
  selectedIndex: number | null;
  onToggle: (item: GalleryItem) => void;
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
      <Pressable style={styles.galleryCell} onPress={() => onToggle(item)}>
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={styles.galleryImage} resizeMode="cover" />
        ) : (
          <View style={styles.galleryVideoFallback}>
            <MaterialCommunityIcons name="movie-open-play-outline" size={28} color="#FFFFFF" />
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
        <View style={[styles.selectCircle, isSelected && styles.selectCircleSelected]}>
          {isSelected ? <Text style={styles.selectCircleText}>{selectedIndex}</Text> : null}
        </View>
      </Pressable>
    </View>
  );
});

const SCREEN_HEIGHT = Dimensions.get('window').height;
const COLLAPSED_H = Math.round(SCREEN_HEIGHT * 0.58);
const EXPANDED_H = Math.round(SCREEN_HEIGHT * 0.94);
const SPRING_CFG = { damping: 28, stiffness: 320, mass: 0.9 } as const;

export const InputAttachmentSheet = React.memo(function InputAttachmentSheet({
  visible,
  galleryEnabled,
  galleryItems,
  galleryLoading,
  galleryDenied,
  attachmentActions,
  selectedItems,
  captionValue,
  onClose,
  onToggleGalleryItem,
  onCaptionChange,
  onSendSelected,
  onRunAttachmentAction,
}: InputAttachmentSheetProps) {
  const insets = useSafeAreaInsets();

  // --- Shared values ---
  const sheetH = useSharedValue(COLLAPSED_H);
  const isExpanded = useSharedValue(false);
  const scrollY = useSharedValue(0);
  const dragStartH = useSharedValue(COLLAPSED_H);
  const listPanOffset = useSharedValue(0);

  // --- JS state for close trigger ---
  const [shouldClose, setShouldClose] = React.useState(false);
  React.useEffect(() => {
    if (shouldClose) { setShouldClose(false); onClose(); }
  }, [shouldClose, onClose]);

  // Reset on visibility change
  React.useEffect(() => {
    if (!visible) {
      sheetH.value = COLLAPSED_H;
      isExpanded.value = false;
      scrollY.value = 0;
    }
  }, [visible, sheetH, isExpanded, scrollY]);

  // --- Helpers (worklet) ---
  const snapExpand = () => {
    'worklet';
    isExpanded.value = true;
    sheetH.value = withSpring(EXPANDED_H, SPRING_CFG);
  };

  const snapCollapse = () => {
    'worklet';
    isExpanded.value = false;
    sheetH.value = withSpring(COLLAPSED_H, SPRING_CFG);
  };

  const snapClose = () => {
    'worklet';
    sheetH.value = withTiming(0, { duration: 250, easing: Easing.in(Easing.cubic) });
    runOnJS(setShouldClose)(true);
  };

  // Ref for NativeViewGestureHandler wrapping FlatList (needed for simultaneous gestures)
  const nativeScrollRef = React.useRef<NativeViewGestureHandler>(null);

  // scroll handler: expand on scroll-up
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      scrollY.value = y;

      // Expand when user scrolls list content upward
      if (y > 8 && !isExpanded.value) {
        snapExpand();
      }
    },
  });

  // Header drag-handle pan (always works)
  const headerPan = Gesture.Pan()
    .onBegin(() => {
      dragStartH.value = sheetH.value;
    })
    .onUpdate((e) => {
      const next = dragStartH.value - e.translationY;
      sheetH.value = Math.max(0, Math.min(EXPANDED_H, next));
    })
    .onEnd((e) => {
      const vel = e.velocityY;
      const cur = sheetH.value;
      if (vel > 700 || cur < COLLAPSED_H * 0.55) {
        snapClose();
      } else if (!isExpanded.value && (cur > COLLAPSED_H + 60 || vel < -500)) {
        snapExpand();
      } else if (isExpanded.value && cur < EXPANDED_H - 60) {
        snapCollapse();
      } else if (isExpanded.value) {
        snapExpand();
      } else {
        snapCollapse();
      }
    });

  // Pan simultaneous with the FlatList native handler.
  // Pulling down when at top of list drags the sheet down.
  const listPan = Gesture.Pan()
    .simultaneousWithExternalGesture(nativeScrollRef)
    .onBegin(() => {
      dragStartH.value = sheetH.value;
      listPanOffset.value = 0;
    })
    .onUpdate((e) => {
      // Only pull the sheet down when the list is truly at the top
      if (scrollY.value <= 2 && e.translationY > 0) {
        if (listPanOffset.value === 0) {
          listPanOffset.value = e.translationY;
          dragStartH.value = sheetH.value;
        }
        const pullDown = e.translationY - listPanOffset.value;
        if (pullDown > 0) {
          sheetH.value = Math.max(0, dragStartH.value - pullDown);
        }
      } else {
        listPanOffset.value = 0;
        dragStartH.value = sheetH.value;
      }
    })
    .onEnd((e) => {
      const vel = e.velocityY; // positive = downward
      const cur = sheetH.value;
      
      if (scrollY.value <= 2 && e.translationY > 0 && listPanOffset.value > 0) {
        // Decide close vs collapse vs snap-back
        if (vel > 400 || cur < COLLAPSED_H * 0.7) {
          if (isExpanded.value) snapCollapse(); else snapClose();
        } else {
          if (isExpanded.value) snapExpand(); else snapCollapse();
        }
      } else {
        // Not at top or wasn't pulling down: just snap to correct position
        if (isExpanded.value) snapExpand(); else snapCollapse();
      }
      listPanOffset.value = 0;
    });

  // --- Animated styles ---
  const sheetStyle = useAnimatedStyle(() => ({ height: sheetH.value }));

  // --- Gallery helpers ---
  const selectedById = React.useMemo(() => {
    const map = new Map<string, number>();
    selectedItems.forEach((item, i) => map.set(item.id, i + 1));
    return map;
  }, [selectedItems]);

  const keyExtractor = React.useCallback((item: GalleryItem) => item.id, []);

  const renderItem = React.useCallback(
    ({ item }: { item: GalleryItem }) => (
      <GalleryCell
        item={item}
        selectedIndex={selectedById.get(item.id) ?? null}
        onToggle={onToggleGalleryItem}
      />
    ),
    [selectedById, onToggleGalleryItem],
  );

  const hasSelection = selectedItems.length > 0;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <Reanimated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 8) + 10 },
            sheetStyle,
          ]}
        >
          {/* Drag handle */}
          <GestureDetector gesture={headerPan}>
            <View style={styles.handleArea}>
              <View style={styles.handlePill} />
              <View style={styles.sheetHeader}>
                <Pressable style={styles.headerCircle} onPress={onClose} hitSlop={8}>
                  <Feather name="x" size={24} color="#111827" />
                </Pressable>

                {hasSelection ? (
                  <View style={styles.selectedPill}>
                    <Feather name="check" size={16} color="#FFFFFF" />
                    <Text style={styles.selectedPillText}>{selectedItems.length}</Text>
                  </View>
                ) : null}

                <View style={styles.titlePill}>
                  <Text style={styles.sheetTitle}>Недавние</Text>
                </View>

                <Pressable style={styles.headerCircle} hitSlop={8}>
                  <Feather name="more-horizontal" size={24} color="#111827" />
                </Pressable>
              </View>
            </View>
          </GestureDetector>

          {/* Gallery content */}
          {galleryEnabled ? (
            galleryLoading ? (
              <View style={styles.flex}>
                <GallerySkeletonGrid rows={4} />
              </View>
            ) : galleryDenied ? (
              <View style={styles.galleryPlaceholder}>
                <Text style={styles.galleryHint}>Нужен доступ к фото и видео.</Text>
              </View>
            ) : galleryItems.length > 0 ? (
              <GestureDetector gesture={listPan}>
                <NativeViewGestureHandler ref={nativeScrollRef}>
                  <View style={styles.flex}>
                    <AnimatedFlatList
                      data={galleryItems}
                      keyExtractor={keyExtractor}
                      renderItem={renderItem}
                      numColumns={3}
                      style={styles.flex}
                      contentContainerStyle={[
                        styles.galleryGrid,
                        { paddingBottom: hasSelection ? 74 : 78 },
                      ]}
                      columnWrapperStyle={styles.galleryRow}
                      showsVerticalScrollIndicator={false}
                      removeClippedSubviews
                      bounces={false}
                      initialNumToRender={18}
                      maxToRenderPerBatch={12}
                      windowSize={5}
                      updateCellsBatchingPeriod={40}
                      keyboardShouldPersistTaps="handled"
                      onScroll={scrollHandler}
                      scrollEventThrottle={16}
                    />
                  </View>
                </NativeViewGestureHandler>
              </GestureDetector>
            ) : (
              <View style={styles.galleryPlaceholder}>
                <Text style={styles.galleryHint}>Медиа не найдены.</Text>
              </View>
            )
          ) : null}

          {/* Bottom dock */}
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
                  placeholderTextColor="#8B95A1"
                  style={styles.captionInput}
                  multiline
                />
                <Pressable style={styles.sendBtn} onPress={onSendSelected}>
                  <Feather name="send" size={20} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : (
              <View style={styles.modeDock}>
                <View style={[styles.modeAction, styles.modeActionActive]}>
                  <MaterialCommunityIcons name="image-multiple" size={22} color="#4B8FEA" />
                  <Text style={[styles.modeActionLabel, styles.modeActionLabelActive]}>Галерея</Text>
                </View>
                {attachmentActions.map((action) => (
                  <Pressable
                    key={action.key}
                    style={styles.modeAction}
                    onPress={() => onRunAttachmentAction(action.onPress)}
                  >
                    <SheetActionIcon tone={action.tone} />
                    <Text style={styles.modeActionLabel}>{action.title}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </Reanimated.View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
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
    backgroundColor: 'rgba(15,23,42,0.14)',
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
    backgroundColor: 'rgba(248,250,252,0.96)',
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
    backgroundColor: '#5A86DF',
  },
  selectedPillText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  titlePill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  flex: { flex: 1 },
  galleryGrid: { paddingBottom: 78 },
  galleryRow: { gap: 1, marginBottom: 1 },
  galleryCellOuter: { flex: 1 },
  galleryCell: { aspectRatio: 1, overflow: 'hidden', backgroundColor: '#D8DEE7' },
  galleryImage: { width: '100%', height: '100%' },
  galleryVideoFallback: {
    flex: 1, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
  },
  galleryVideoOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.12)',
  },
  galleryVideoBadge: {
    position: 'absolute', right: 7, bottom: 7, flexDirection: 'row',
    alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4,
    borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.72)',
  },
  galleryVideoPlayIcon: { marginLeft: 1 },
  galleryVideoBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  selectCircle: {
    position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.7, borderColor: 'rgba(255,255,255,0.95)',
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  selectCircleSelected: { borderColor: '#5A86DF', backgroundColor: '#5A86DF' },
  selectCircleText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  galleryPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26,
  },
  galleryHint: { fontSize: 15, lineHeight: 21, color: '#6B7280', textAlign: 'center' },
  bottomAccessory: { position: 'absolute', left: 16, right: 16 },
  modeDock: {
    minHeight: 58, borderRadius: 22, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#0F172A', shadowOpacity: 0.16, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }, elevation: 7,
  },
  modeAction: {
    minWidth: 72, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16,
  },
  modeActionActive: { backgroundColor: 'rgba(75,143,234,0.1)' },
  modeActionLabel: { marginTop: 3, fontSize: 12, fontWeight: '700', color: '#4B5563' },
  modeActionLabelActive: { color: '#4B8FEA' },
  captionBar: {
    minHeight: 56, borderRadius: 24, flexDirection: 'row', alignItems: 'flex-end',
    paddingLeft: 15, paddingRight: 7, paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.94)',
    shadowColor: '#0F172A', shadowOpacity: 0.16, shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  captionInput: {
    flex: 1, maxHeight: 92, minHeight: 42, paddingTop: 11, paddingBottom: 9,
    paddingHorizontal: 0, fontSize: 16, lineHeight: 20, color: '#111827',
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21, marginLeft: 8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#5A86DF',
  },
});
