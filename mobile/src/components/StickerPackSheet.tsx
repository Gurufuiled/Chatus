import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
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
import { formatStickerPanelTopTabAnnouncement } from '../stickers/stickerPanelA11y';
import { hapticStickerPreviewReveal, hapticStickerSheetDismiss, hapticStickerSheetPick } from '../stickers/chatusStickerPanelHaptics';

const THUMB = 72;
const EMOJI_COLUMNS = 8;
const PACK_RAIL_W = 52;
/** Крупное превью по long-press (фаза 4.3 журнала), в пределах ширины экрана. */
const STICKER_PREVIEW_IMAGE = 216;

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
  initialTopTabSnapshot = null,
  onInitialTopTabSnapshotConsumed,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const sheetMax = useMemo(() => Math.round(windowHeight * 0.46), [windowHeight]);
  const pagerBodyHeight = useMemo(
    () => Math.max(220, Math.min(Math.round(windowHeight * 0.36), sheetMax - 84)),
    [sheetMax, windowHeight],
  );
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
  const pagerRef = useRef<ScrollView>(null);
  /** Пользователь уже сменил вкладку после открытия — не применять отложенный restore из SecureStore. */
  const userAdjustedTopTabRef = useRef(false);
  /** Сессия открыта с `initialTopTabSnapshot` — не подмешивать restore вкладки из SecureStore после сброса snapshot в `null`. */
  const skipTopTabPersistRef = useRef(false);
  const pageWidth = windowWidth;
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
    if (!visible) {
      setStickerSearchQuery('');
      setRecentMruLoaded(false);
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
  }, [visible, clearStickerPreview]);

  const stickerGridData = useMemo(
    () => filterStickerSheetItems(activeSection?.stickers ?? [], stickerSearchQuery),
    [activeSection?.stickers, stickerSearchQuery],
  );

  useLayoutEffect(() => {
    if (!visible) return;
    const x = topTabIndex * pageWidth;
    pagerRef.current?.scrollTo({ x, animated: false });
  }, [visible, pageWidth, topTabIndex]);

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
        requestAnimationFrame(() => {
          if (cancelled) return;
          pagerRef.current?.scrollTo({ x: idx * pageWidth, animated: false });
        });
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
      requestAnimationFrame(() => {
        if (cancelled || userAdjustedTopTabRef.current) return;
        pagerRef.current?.scrollTo({ x: idx * pageWidth, animated: false });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [visible, pageWidth, initialTopTabSnapshot, onInitialTopTabSnapshotConsumed]);

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

  const scrollToTab = useCallback(
    (index: number, animated: boolean) => {
      const prev = topTabIndexRef.current;
      userAdjustedTopTabRef.current = true;
      commitTopTab(index, true);
      pagerRef.current?.scrollTo({ x: index * pageWidth, animated });
      if (index !== prev) {
        announceStickerPanelTopTab(index);
      }
    },
    [commitTopTab, pageWidth],
  );

  const onPagerScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / Math.max(1, pageWidth));
      const clampedNext = Math.max(0, Math.min(TOP_TABS.length - 1, next));
      const prev = topTabIndexRef.current;
      if (clampedNext !== prev) {
        userAdjustedTopTabRef.current = true;
      }
      commitTopTab(next, true);
      if (clampedNext !== prev) {
        announceStickerPanelTopTab(clampedNext);
      }
    },
    [commitTopTab, pageWidth],
  );

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
      onClose();
    },
    [onClose, onPickSticker],
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
      onClose();
    },
    [onClose, onPickEmoji],
  );

  const renderSticker = useCallback(
    ({ item }: { item: StickerSheetItem }) => {
      const src = resolveStickerImage({ packId: item.packId, stickerId: item.stickerId });
      if (!src) return <View style={[styles.thumbCell, styles.thumbMissing]} />;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Стикер, набор ${item.packId}, ${item.stickerId}`}
          accessibilityHint="Долгое нажатие — крупное превью перед отправкой"
          delayLongPress={400}
          onLongPress={() => onStickerCellLongPress(item)}
          onPress={() => onStickerCellPress(item)}
          style={({ pressed }) => [styles.thumbCell, pressed && styles.thumbCellPressed]}
        >
          <Image source={src} style={styles.thumbImage} contentFit="contain" cachePolicy="memory-disk" />
        </Pressable>
      );
    },
    [onStickerCellLongPress, onStickerCellPress, styles.thumbCell, styles.thumbCellPressed, styles.thumbImage, styles.thumbMissing],
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
          !onPickEmoji && styles.emojiCellDisabled,
          pressed && onPickEmoji && styles.emojiCellPressed,
        ]}
      >
        <Text style={styles.emojiGlyph}>{item}</Text>
      </Pressable>
    ),
    [handleEmojiPress, onPickEmoji, styles.emojiCell, styles.emojiCellDisabled, styles.emojiCellPressed, styles.emojiGlyph],
  );

  const stickersPage = (
    <View style={[styles.page, { width: pageWidth, height: pagerBodyHeight }]}>
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
            columnWrapperStyle={styles.gridRow}
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
    <View style={[styles.page, { width: pageWidth, height: pagerBodyHeight }]}>
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
    <View style={[styles.page, styles.gifPage, { width: pageWidth, height: pagerBodyHeight }]}>
      <Text style={styles.placeholderTitle}>GIF</Text>
      <Text style={styles.placeholderHint}>Скоро — поиск и отправка GIF из каталога.</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={handleSheetRequestClose}>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={() => userDismissOrClearStickerPreviewRef.current()}
          accessibilityRole="button"
          accessibilityLabel="Закрыть панель"
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 10) + 8, maxHeight: sheetMax }]}
          accessibilityViewIsModal
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
                  onPress={() => scrollToTab(i, true)}
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
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onMomentumScrollEnd={onPagerScrollEnd}
            scrollEventThrottle={16}
            style={{ width: pageWidth, height: pagerBodyHeight }}
            accessibilityLabel="Контент панели. Листайте влево или вправо двумя пальцами, чтобы сменить раздел."
            accessibilityHint="Влево — следующий раздел, вправо — предыдущий"
          >
            {emojiPage}
            {stickersPage}
            {gifPage}
          </ScrollView>
        </View>
        {stickerPreviewItem ? (
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
        ) : null}
      </View>
    </Modal>
  );
}

function createStyles(c: ThemeColors) {
  const shadow = withAlpha('#000000', 0.4);
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: shadow },
    sheet: {
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
    },
    stickersSplit: {
      flex: 1,
      flexDirection: 'row',
      minHeight: 0,
    },
    packRail: {
      width: PACK_RAIL_W,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: withAlpha(c.textSecondary, 0.2),
    },
    packRailContent: {
      paddingVertical: 6,
      paddingHorizontal: 6,
      gap: 8,
      alignItems: 'center',
    },
    packRailCell: {
      width: PACK_RAIL_W - 12,
      height: PACK_RAIL_W - 12,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(c.textSecondary, 0.08),
    },
    packRailCellSelected: {
      backgroundColor: withAlpha(c.accent, 0.22),
    },
    packRailThumb: {
      width: PACK_RAIL_W - 22,
      height: PACK_RAIL_W - 22,
    },
    stickersMain: {
      flex: 1,
      minWidth: 0,
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
      paddingBottom: 10,
      gap: 8,
      alignItems: 'center',
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
      gap: 8,
      marginBottom: 8,
    },
    thumbCell: {
      width: THUMB,
      height: THUMB,
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
    thumbImage: {
      width: THUMB - 12,
      height: THUMB - 12,
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
      width: `${100 / EMOJI_COLUMNS}%`,
      aspectRatio: 1,
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
      fontSize: 26,
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
