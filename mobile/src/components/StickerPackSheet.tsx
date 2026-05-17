import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type LayoutChangeEvent,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';
import { CHATUS_QUICK_EMOJIS } from '../stickers/chatusEmojiGrid';
import {
  canonicalFriendStickerRef,
  CHATUS_STICKER_PACK_RAIL,
  getStickerSheetItemsForPack,
  type ChatusStickerRef,
  resolveStickerImage,
  type StickerSheetItem,
  type StickerSheetSection,
} from '../stickers/chatusStickerCatalog';
import {
  loadStickerPanelTopTab,
  persistStickerPanelTopTab,
  type StickerPanelTopTab,
} from '../stickers/stickerPanelPreferences';
import { loadRecentStickers, rememberStickerPick } from '../stickers/recentStickersStorage';
import { filterStickerSheetItems } from '../stickers/stickerSheetSearch';
import {
  computeEmojiCellSize,
  computeStickerMainWidth,
  computeStickerThumbSize,
  STICKER_PANEL_EMOJI_COLUMNS,
  STICKER_PANEL_PACK_RAIL_W,
  STICKER_PANEL_STICKER_GAP,
} from '../stickers/stickerPanelLayout';
import { formatStickerPanelTopTabAnnouncement } from '../stickers/stickerPanelA11y';
import { hapticStickerPreviewReveal, hapticStickerSheetDismiss, hapticStickerSheetPick } from '../stickers/chatusStickerPanelHaptics';

const EMOJI_COLUMNS = STICKER_PANEL_EMOJI_COLUMNS;
const PACK_RAIL_W = STICKER_PANEL_PACK_RAIL_W;
/** Крупное превью по long-press (фаза 4.3 журнала), в пределах ширины экрана. */
const STICKER_PREVIEW_IMAGE = 216;

const DOCK_LIFT_MS = 280;
const DOCK_LOWER_MS = 240;

const TOP_TABS: { id: StickerPanelTopTab; label: string }[] = [
  { id: 'emoji', label: 'Emoji' },
  { id: 'stickers', label: 'Стикеры' },
  { id: 'gif', label: 'GIF' },
];

function tabIndexFromId(id: StickerPanelTopTab): number {
  return TOP_TABS.findIndex((t) => t.id === id);
}

function announceStickerPanelTopTab(tabIndex: number): void {
  const tab = TOP_TABS[tabIndex];
  if (!tab) return;
  void AccessibilityInfo.announceForAccessibility(
    formatStickerPanelTopTabAnnouncement(tabIndex, tab.label, TOP_TABS.length),
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onPickSticker: (ref: ChatusStickerRef) => void;
  /** Вставка эмодзи в поле ввода (вкладка Emoji). */
  onPickEmoji?: (emoji: string) => void;
  /**
   * `dock` — панель в потоке под полем ввода (как Telegram). `modal` — полноэкранный Modal с затемнением.
   */
  variant?: 'modal' | 'dock';
  /**
   * При открытии панели: верхняя вкладка (например long-press смайла → `emoji`).
   * Сбрасывается через `onInitialTopTabSnapshotConsumed` после применения.
   */
  initialTopTabSnapshot?: StickerPanelTopTab | null;
  onInitialTopTabSnapshotConsumed?: () => void;
};

export function StickerPackSheet({
  visible,
  onClose,
  onPickSticker,
  onPickEmoji,
  variant = 'modal',
  initialTopTabSnapshot = null,
  onInitialTopTabSnapshotConsumed,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  /** Dock: до первого layout ширина хоста может быть 0 — pager не должен брать полный экран (padding inputRow). */
  const DOCK_SHEET_WIDTH_FALLBACK_PAD = 24;
  /** Ширина хоста (dock может быть уже `Dimensions` из‑за padding/оболочки) — иначе pager ломается. */
  const [hostWidth, setHostWidth] = useState(0);
  const sheetWidth =
    hostWidth > 0
      ? hostWidth
      : variant === 'dock'
        ? Math.max(240, Math.round(windowWidth - DOCK_SHEET_WIDTH_FALLBACK_PAD))
        : windowWidth;
  const onSheetHostLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w <= 0) return;
    setHostWidth((prev) => (w !== prev ? w : prev));
  }, []);
  const sheetMax = useMemo(() => Math.round(windowHeight * 0.46), [windowHeight]);
  const pagerBodyHeight = useMemo(
    () => Math.max(220, Math.min(Math.round(windowHeight * 0.36), sheetMax - 84)),
    [sheetMax, windowHeight],
  );
  const stickerMainWidth = useMemo(
    () => computeStickerMainWidth(sheetWidth, StyleSheet.hairlineWidth),
    [sheetWidth],
  );
  const stickerThumbSize = useMemo(() => computeStickerThumbSize(stickerMainWidth), [stickerMainWidth]);
  const emojiCellSize = useMemo(() => computeEmojiCellSize(sheetWidth), [sheetWidth]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [recentStickers, setRecentStickers] = useState<StickerSheetItem[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<'recent' | 'catalog'>('recent');
  const [activePackId, setActivePackId] = useState(CHATUS_STICKER_PACK_RAIL[0]?.packId ?? 'friend');
  const [stickerSearchQuery, setStickerSearchQuery] = useState('');
  /** После открытия шторки: не показывать «пусто», пока не прочитали MRU из SecureStore. */
  const [recentMruLoaded, setRecentMruLoaded] = useState(false);
  const [topTabIndex, setTopTabIndex] = useState(1);
  const topTabIndexRef = useRef(topTabIndex);
  topTabIndexRef.current = topTabIndex;
  /** Не вызывать `setState` из `runOnJS` после размонтирования. */
  const aliveRef = useRef(true);
  /** Пользователь уже сменил вкладку после открытия — не применять отложенный restore из SecureStore. */
  const userAdjustedTopTabRef = useRef(false);
  /** Сессия открыта с `initialTopTabSnapshot` — не подмешивать restore вкладки из SecureStore после сброса snapshot в `null`. */
  const skipTopTabPersistRef = useRef(false);
  const closeFromUserDismiss = useCallback(() => {
    hapticStickerSheetDismiss();
    onClose();
  }, [onClose]);
  const [stickerPreviewItem, setStickerPreviewItem] = useState<StickerSheetItem | null>(null);
  /** После long-press RN может вызвать `onPress` на отпускании — не отправлять стикер дважды. */
  const skipStickerTapPickAfterLongPressRef = useRef(false);

  const clearStickerPreview = useCallback(() => {
    skipStickerTapPickAfterLongPressRef.current = false;
    setStickerPreviewItem(null);
  }, []);

  const handleSheetRequestClose = useCallback(() => {
    if (stickerPreviewItem) {
      clearStickerPreview();
      return;
    }
    closeFromUserDismiss();
  }, [clearStickerPreview, closeFromUserDismiss, stickerPreviewItem]);

  const stickerPreviewItemRef = useRef<StickerSheetItem | null>(null);
  stickerPreviewItemRef.current = stickerPreviewItem;

  const userDismissOrClearStickerPreviewRef = useRef<() => void>(() => {});
  userDismissOrClearStickerPreviewRef.current = () => {
    if (stickerPreviewItemRef.current) {
      clearStickerPreview();
      return;
    }
    closeFromUserDismiss();
  };

  const sheetDismissPan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 12 && g.dy > Math.abs(g.dx) * 1.15,
        onPanResponderRelease: (_, g) => {
          if (g.dy > 68 || g.vy > 0.4) userDismissOrClearStickerPreviewRef.current();
        },
      }),
    [],
  );

  useEffect(() => {
    if (variant !== 'dock' || !visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleSheetRequestClose();
      return true;
    });
    return () => sub.remove();
  }, [variant, visible, handleSheetRequestClose]);

  const catalogSheetItems = useMemo(() => getStickerSheetItemsForPack(activePackId), [activePackId]);

  const activePackTitle = useMemo(
    () => CHATUS_STICKER_PACK_RAIL.find((p) => p.packId === activePackId)?.title ?? 'Стикеры',
    [activePackId],
  );

  const stickerSections = useMemo<StickerSheetSection[]>(
    () => [
      { id: 'recent', title: 'Недавние', stickers: recentStickers },
      { id: 'catalog', title: activePackTitle, stickers: catalogSheetItems },
    ],
    [recentStickers, catalogSheetItems, activePackTitle],
  );

  const activeSection = useMemo(
    () => stickerSections.find((s) => s.id === activeSectionId) ?? stickerSections[0],
    [activeSectionId, stickerSections],
  );

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setStickerSearchQuery('');
      setRecentMruLoaded(false);
      if (variant !== 'dock') {
        setHostWidth(0);
      }
      clearStickerPreview();
      return;
    }
    setRecentStickers([]);
    setRecentMruLoaded(false);
    let cancelled = false;
    void loadRecentStickers().then((rows) => {
      if (cancelled) return;
      setRecentStickers(rows.map((r) => ({ packId: r.packId, stickerId: r.stickerId })));
      setRecentMruLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, clearStickerPreview, variant]);

  const stickerGridData = useMemo(
    () => filterStickerSheetItems(activeSection?.stickers ?? [], stickerSearchQuery),
    [activeSection?.stickers, stickerSearchQuery],
  );

  useEffect(() => {
    if (!visible) {
      userAdjustedTopTabRef.current = false;
      skipTopTabPersistRef.current = false;
      return;
    }
    let cancelled = false;

    if (initialTopTabSnapshot) {
      const idx = tabIndexFromId(initialTopTabSnapshot);
      if (idx >= 0) {
        skipTopTabPersistRef.current = true;
        userAdjustedTopTabRef.current = true;
        setTopTabIndex(idx);
        onInitialTopTabSnapshotConsumed?.();
        return () => {
          cancelled = true;
        };
      }
      onInitialTopTabSnapshotConsumed?.();
    }

    if (skipTopTabPersistRef.current) {
      return () => {
        cancelled = true;
      };
    }

    userAdjustedTopTabRef.current = false;
    void loadStickerPanelTopTab().then((saved) => {
      if (cancelled || userAdjustedTopTabRef.current) return;
      if (!saved) return;
      const idx = tabIndexFromId(saved);
      if (idx < 0) return;
      setTopTabIndex(idx);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, initialTopTabSnapshot, onInitialTopTabSnapshotConsumed]);

  const commitTopTab = useCallback(
    (index: number, writeDisk: boolean) => {
      const clamped = Math.max(0, Math.min(TOP_TABS.length - 1, index));
      setTopTabIndex(clamped);
      if (writeDisk) {
        const id = TOP_TABS[clamped]?.id;
        if (id) persistStickerPanelTopTab(id);
      }
    },
    [],
  );

  const selectTab = useCallback(
    (index: number) => {
      const prev = topTabIndexRef.current;
      userAdjustedTopTabRef.current = true;
      commitTopTab(index, true);
      if (index !== prev) {
        announceStickerPanelTopTab(index);
      }
    },
    [commitTopTab],
  );

  const dockAnimHeightFallback = useMemo(() => {
    if (variant !== 'dock') return 360;
    const padBottom = 10;
    return Math.min(
      sheetMax,
      Math.ceil(6 + 4 + 12 + 46 + 8 + 10 + pagerBodyHeight + padBottom + 8),
    );
  }, [variant, sheetMax, pagerBodyHeight]);

  const [dockMounted, setDockMounted] = useState(false);
  const dockLiftProgress = useSharedValue(0);
  const dockSheetH = useSharedValue(dockAnimHeightFallback);

  /** Dock: сброс измеренной ширины только когда шторка полностью убрана (после анимации закрытия). */
  useEffect(() => {
    if (variant !== 'dock') return;
    if (visible || dockMounted) return;
    setHostWidth(0);
  }, [variant, visible, dockMounted]);

  useEffect(() => {
    if (variant !== 'dock') return;
    dockSheetH.value = Math.max(dockSheetH.value, dockAnimHeightFallback);
  }, [variant, dockAnimHeightFallback, dockSheetH]);

  useEffect(() => {
    if (variant !== 'dock' || !visible) return;
    setDockMounted(true);
  }, [variant, visible]);

  const finishDockLower = useCallback(() => {
    if (!aliveRef.current) return;
    setDockMounted(false);
  }, []);

  useEffect(() => {
    if (variant !== 'dock') {
      cancelAnimation(dockLiftProgress);
      dockLiftProgress.value = 0;
      setDockMounted(false);
      return;
    }
    cancelAnimation(dockLiftProgress);
    if (visible) {
      dockLiftProgress.value = withTiming(1, {
        duration: DOCK_LIFT_MS,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }
    if (!dockMounted) return;
    dockLiftProgress.value = withTiming(
      0,
      {
        duration: DOCK_LOWER_MS,
        easing: Easing.in(Easing.cubic),
      },
      (finished) => {
        if (finished) runOnJS(finishDockLower)();
      },
    );
  }, [variant, visible, dockMounted, finishDockLower, dockLiftProgress]);

  const onDockSheetLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (variant !== 'dock') return;
      const h = Math.ceil(e.nativeEvent.layout.height);
      if (h > 0) dockSheetH.value = Math.max(dockSheetH.value, h);
    },
    [variant, dockSheetH],
  );

  const dockLiftStyle = useAnimatedStyle(() => {
    const h = Math.max(56, dockSheetH.value);
    const p = dockLiftProgress.value;
    return {
      transform: [{ translateY: (1 - p) * h }],
      opacity: 0.88 + 0.12 * p,
    };
  });

  const handlePick = useCallback(
    (item: StickerSheetItem) => {
      const ref =
        item.packId === 'friend'
          ? canonicalFriendStickerRef({ packId: item.packId, stickerId: item.stickerId })
          : { packId: item.packId, stickerId: item.stickerId };
      hapticStickerSheetPick();
      void rememberStickerPick(ref).then((rows) => {
        setRecentStickers(rows.map((r) => ({ packId: r.packId, stickerId: r.stickerId })));
      });
      onPickSticker(ref);
    },
    [onPickSticker],
  );

  const confirmStickerPreviewSend = useCallback(() => {
    const item = stickerPreviewItem;
    if (!item) return;
    clearStickerPreview();
    handlePick(item);
  }, [clearStickerPreview, handlePick, stickerPreviewItem]);

  const onStickerCellPress = useCallback(
    (item: StickerSheetItem) => {
      if (skipStickerTapPickAfterLongPressRef.current) {
        skipStickerTapPickAfterLongPressRef.current = false;
        return;
      }
      handlePick(item);
    },
    [handlePick],
  );

  const onStickerCellLongPress = useCallback((item: StickerSheetItem) => {
    skipStickerTapPickAfterLongPressRef.current = true;
    hapticStickerPreviewReveal();
    setStickerPreviewItem(item);
  }, []);

  const handleEmojiPress = useCallback(
    (emoji: string) => {
      hapticStickerSheetPick();
      onPickEmoji?.(emoji);
    },
    [onPickEmoji],
  );

  const renderSticker = useCallback(
    ({ item }: { item: StickerSheetItem }) => {
      const src = resolveStickerImage({ packId: item.packId, stickerId: item.stickerId });
      const thumbInner = Math.max(24, stickerThumbSize - 10);
      if (!src) {
        return (
          <View
            style={[
              styles.thumbCellBase,
              { width: stickerThumbSize, height: stickerThumbSize },
              styles.thumbMissing,
            ]}
          />
        );
      }
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Стикер, набор ${item.packId}, ${item.stickerId}`}
          accessibilityHint="Долгое нажатие — крупное превью перед отправкой"
          delayLongPress={400}
          onLongPress={() => onStickerCellLongPress(item)}
          onPress={() => onStickerCellPress(item)}
          style={({ pressed }) => [
            styles.thumbCellBase,
            { width: stickerThumbSize, height: stickerThumbSize },
            pressed && styles.thumbCellPressed,
          ]}
        >
          <Image
            source={src}
            style={{ width: thumbInner, height: thumbInner }}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={`${item.packId}:${item.stickerId}`}
          />
        </Pressable>
      );
    },
    [
      onStickerCellLongPress,
      onStickerCellPress,
      stickerThumbSize,
      styles.thumbCellBase,
      styles.thumbCellPressed,
      styles.thumbMissing,
    ],
  );

  const renderEmoji = useCallback(
    ({ item }: { item: string }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Эмодзи ${item}`}
        onPress={() => handleEmojiPress(item)}
        disabled={!onPickEmoji}
        style={({ pressed }) => [
          styles.emojiCell,
          { width: emojiCellSize, height: emojiCellSize },
          !onPickEmoji && styles.emojiCellDisabled,
          pressed && onPickEmoji && styles.emojiCellPressed,
        ]}
      >
        <Text style={[styles.emojiGlyph, { fontSize: Math.min(30, Math.round(emojiCellSize * 0.88)) }]}>
          {item}
        </Text>
      </Pressable>
    ),
    [
      emojiCellSize,
      handleEmojiPress,
      onPickEmoji,
      styles.emojiCell,
      styles.emojiCellDisabled,
      styles.emojiCellPressed,
      styles.emojiGlyph,
    ],
  );

  const stickersPage = (
    <View style={[styles.page, { width: sheetWidth, height: pagerBodyHeight }]}>
      <View style={styles.stickersSplit}>
        <ScrollView
          style={styles.packRail}
          contentContainerStyle={styles.packRailContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {CHATUS_STICKER_PACK_RAIL.map((pack) => {
            const selected = pack.packId === activePackId;
            const coverSrc = resolveStickerImage({ packId: pack.packId, stickerId: pack.coverStickerId });
            return (
              <Pressable
                key={pack.packId}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Набор стикеров ${pack.title}`}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                onPress={() => {
                  setActivePackId(pack.packId);
                  setActiveSectionId('catalog');
                }}
                style={[styles.packRailCell, selected && styles.packRailCellSelected]}
              >
                {coverSrc ? (
                  <Image source={coverSrc} style={styles.packRailThumb} contentFit="contain" cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.packRailThumb, styles.thumbMissing]} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.stickersMain}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {stickerSections.map((sec) => {
              const selected = sec.id === activeSectionId;
              return (
                <Pressable
                  key={sec.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Раздел стикеров: ${sec.title}`}
                  onPress={() => setActiveSectionId(sec.id as 'recent' | 'catalog')}
                  style={[styles.tab, selected && styles.tabSelected]}
                >
                  <Text style={[styles.tabText, selected && styles.tabTextSelected]} numberOfLines={1}>
                    {sec.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <TextInput
            value={stickerSearchQuery}
            onChangeText={setStickerSearchQuery}
            placeholder="Поиск по коду…"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Поиск стикеров по коду каталога"
            style={styles.stickerSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          <FlatList
            style={styles.stickerListFlex}
            data={stickerGridData}
            keyExtractor={(it) => `${it.packId}:${it.stickerId}`}
            numColumns={4}
            renderItem={renderSticker}
            columnWrapperStyle={[styles.gridRow, { gap: STICKER_PANEL_STICKER_GAP }]}
            contentContainerStyle={styles.gridPad}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            ListEmptyComponent={
              <Text style={styles.recentEmptyHint}>
                {activeSectionId === 'recent' && !recentMruLoaded
                  ? 'Загрузка…'
                  : activeSectionId === 'recent' && !stickerSearchQuery.trim()
                    ? 'Отправленные стикеры появятся здесь.'
                    : 'По запросу ничего не найдено.'}
              </Text>
            }
          />
        </View>
      </View>
    </View>
  );

  const emojiPage = (
    <View style={[styles.page, { width: sheetWidth, height: pagerBodyHeight }]}>
      <FlatList
        style={styles.stickerListFlex}
        data={CHATUS_QUICK_EMOJIS}
        keyExtractor={(c, i) => `${c}-${i}`}
        numColumns={EMOJI_COLUMNS}
        renderItem={renderEmoji}
        columnWrapperStyle={styles.emojiRow}
        contentContainerStyle={styles.emojiGridPad}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          !onPickEmoji ? (
            <Text style={styles.placeholderHint}>Эмодзи недоступны в этом режиме ввода.</Text>
          ) : null
        }
      />
    </View>
  );

  const gifPage = (
    <View style={[styles.page, styles.gifPage, { width: sheetWidth, height: pagerBodyHeight }]}>
      <Text style={styles.placeholderTitle}>GIF</Text>
      <Text style={styles.placeholderHint}>Скоро — поиск и отправка GIF из каталога.</Text>
    </View>
  );

  const activePage = topTabIndex === 0 ? emojiPage : topTabIndex === 1 ? stickersPage : gifPage;

  const sheetPaddingBottom =
    variant === 'dock' ? 10 : Math.max(insets.bottom, 10) + 8;

  const stickerPreviewOverlay = stickerPreviewItem ? (
    <View
      style={styles.previewOverlayRoot}
      accessibilityViewIsModal
      importantForAccessibility="yes"
      accessibilityLabel="Превью стикера"
    >
      <Pressable
        style={styles.previewBackdropDim}
        onPress={clearStickerPreview}
        accessibilityRole="button"
        accessibilityLabel="Закрыть превью"
      />
      <View style={styles.previewCard}>
        {(() => {
          const src = resolveStickerImage({
            packId: stickerPreviewItem.packId,
            stickerId: stickerPreviewItem.stickerId,
          });
          return src ? (
            <Image
              source={src}
              style={styles.previewImage}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.previewImage, styles.thumbMissing]} />
          );
        })()}
        <View style={styles.previewActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Отмена"
            onPress={clearStickerPreview}
            style={({ pressed }) => [styles.previewBtnGhost, pressed && styles.previewBtnPressed]}
          >
            <Text style={styles.previewBtnGhostText}>Отмена</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Отправить стикер"
            onPress={confirmStickerPreviewSend}
            style={({ pressed }) => [styles.previewBtnPrimary, pressed && styles.previewBtnPressed]}
          >
            <Text style={styles.previewBtnPrimaryText}>Отправить</Text>
          </Pressable>
        </View>
      </View>
    </View>
  ) : null;

  const sheetBody = (
    <View
      style={[styles.sheet, { paddingBottom: sheetPaddingBottom, maxHeight: sheetMax }]}
      accessibilityViewIsModal={variant !== 'dock'}
    >
      <View
        style={styles.grabberWrap}
        accessibilityLabel="Потяните вниз, чтобы закрыть панель"
        accessibilityHint="Удерживайте и потяните вниз, затем отпустите"
        {...sheetDismissPan.panHandlers}
      >
        <View style={styles.grabber} />
      </View>
      <View
        style={styles.topTabBar}
        accessibilityRole="tablist"
        accessibilityLabel="Разделы панели: Emoji, Стикеры или GIF"
      >
        {TOP_TABS.map((t, i) => {
          const selected = i === topTabIndex;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t.label}
              accessibilityHint="Показать этот раздел панели"
              onPress={() => selectTab(i)}
              style={[styles.topTab, selected && styles.topTabSelected]}
            >
              <Text
                style={[styles.topTabText, selected && styles.topTabTextSelected]}
                numberOfLines={1}
                accessible={false}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View
        style={{ width: '100%', height: pagerBodyHeight, overflow: 'hidden' }}
        accessibilityLabel="Контент панели выбранного раздела"
      >
        {activePage}
      </View>
    </View>
  );

  if (variant === 'dock') {
    const showDockShell = visible || dockMounted;
    const previewModal = stickerPreviewItem ? (
      <Modal
        visible
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={clearStickerPreview}
      >
        <View style={styles.previewModalRoot}>{stickerPreviewOverlay}</View>
      </Modal>
    ) : null;

    if (!showDockShell) {
      return previewModal;
    }

    return (
      <>
        <View style={[styles.dockWrap, styles.dockWrapClip]} onLayout={onSheetHostLayout}>
          <Animated.View style={[dockLiftStyle, styles.dockSheetAnim]} onLayout={onDockSheetLayout}>
            {sheetBody}
          </Animated.View>
        </View>
        {previewModal}
      </>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={handleSheetRequestClose}>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={() => userDismissOrClearStickerPreviewRef.current()}
          accessibilityRole="button"
          accessibilityLabel="Закрыть панель"
        />
        <View style={styles.modalSheetHost} onLayout={onSheetHostLayout}>
          {sheetBody}
        </View>
        {stickerPreviewOverlay}
      </View>
    </Modal>
  );
}

function createStyles(c: ThemeColors) {
  const shadow = withAlpha('#000000', 0.4);
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    previewModalRoot: { flex: 1 },
    modalSheetHost: {
      width: '100%',
    },
    dockWrap: {
      width: '100%',
      alignSelf: 'stretch',
    },
    dockWrapClip: {
      overflow: 'hidden',
    },
    dockSheetAnim: {
      width: '100%',
      alignSelf: 'stretch',
    },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: shadow },
    sheet: {
      width: '100%',
      alignSelf: 'stretch',
      backgroundColor: c.inputBackgroundSolid,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingTop: 6,
    },
    grabberWrap: { alignItems: 'center', paddingTop: 4, paddingBottom: 12 },
    grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: withAlpha(c.textSecondary, 0.35) },
    topTabBar: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingBottom: 8,
      gap: 8,
    },
    topTab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: withAlpha(c.textSecondary, 0.1),
    },
    topTabSelected: {
      backgroundColor: withAlpha(c.accent, 0.22),
    },
    topTabText: {
      fontSize: 14,
      fontWeight: '700',
      color: c.textSecondary,
    },
    topTabTextSelected: {
      color: c.accent,
    },
    page: {
      flexDirection: 'column',
      alignSelf: 'stretch',
      width: '100%',
    },
    stickersSplit: {
      flex: 1,
      flexDirection: 'row',
      minHeight: 0,
      alignItems: 'stretch',
      width: '100%',
    },
    packRail: {
      width: 52,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: withAlpha(c.textSecondary, 0.2),
      alignSelf: 'stretch',
    },
    packRailContent: {
      paddingVertical: 8,
      paddingHorizontal: 6,
      gap: 8,
      alignItems: 'center',
    },
    packRailCell: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(c.textSecondary, 0.08),
    },
    packRailCellSelected: {
      backgroundColor: withAlpha(c.accent, 0.22),
    },
    packRailThumb: {
      width: 30,
      height: 30,
    },
    stickersMain: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      alignSelf: 'stretch',
    },
    stickerListFlex: {
      flex: 1,
    },
    gifPage: {
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    placeholderTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 8,
    },
    placeholderHint: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    tabsRow: {
      paddingHorizontal: 10,
      paddingTop: 6,
      paddingBottom: 10,
      gap: 8,
      alignItems: 'center',
      minHeight: 44,
    },
    stickerSearchInput: {
      marginHorizontal: 12,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 12,
      fontSize: 15,
      color: c.textPrimary,
      backgroundColor: withAlpha(c.textSecondary, 0.1),
    },
    tab: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: withAlpha(c.textSecondary, 0.12),
    },
    tabSelected: {
      backgroundColor: withAlpha(c.accent, 0.22),
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
      maxWidth: 120,
    },
    tabTextSelected: {
      color: c.accent,
    },
    gridPad: {
      paddingHorizontal: 12,
      paddingBottom: 6,
    },
    gridRow: {
      justifyContent: 'flex-start',
      marginBottom: 8,
    },
    thumbCellBase: {
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(c.textSecondary, 0.08),
    },
    thumbCellPressed: {
      opacity: 0.86,
      transform: [{ scale: 0.96 }],
    },
    thumbMissing: {
      opacity: 0.35,
    },
    emojiGridPad: {
      paddingHorizontal: 10,
      paddingBottom: 12,
    },
    emojiRow: {
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    emojiCell: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
    },
    emojiCellPressed: {
      backgroundColor: withAlpha(c.textSecondary, 0.12),
    },
    emojiCellDisabled: {
      opacity: 0.45,
    },
    emojiGlyph: {
      textAlign: 'center',
    },
    recentEmptyHint: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
      paddingVertical: 28,
      paddingHorizontal: 20,
    },
    previewOverlayRoot: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 100,
      justifyContent: 'center',
      alignItems: 'center',
      pointerEvents: 'box-none',
    },
    previewBackdropDim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: withAlpha('#000000', 0.5),
    },
    previewCard: {
      zIndex: 2,
      borderRadius: 22,
      paddingVertical: 18,
      paddingHorizontal: 20,
      backgroundColor: c.inputBackgroundSolid,
      alignItems: 'center',
      gap: 16,
      maxWidth: STICKER_PREVIEW_IMAGE + 56,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 12,
    },
    previewImage: {
      width: STICKER_PREVIEW_IMAGE,
      height: STICKER_PREVIEW_IMAGE,
    },
    previewActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 4,
    },
    previewBtnPrimary: {
      paddingVertical: 12,
      paddingHorizontal: 22,
      borderRadius: 14,
      backgroundColor: c.accent,
    },
    previewBtnPrimaryText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    previewBtnGhost: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 14,
      backgroundColor: withAlpha(c.textSecondary, 0.12),
    },
    previewBtnGhostText: {
      fontSize: 16,
      fontWeight: '600',
      color: c.textSecondary,
    },
    previewBtnPressed: {
      opacity: 0.88,
    },
  });
}
