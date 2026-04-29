import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';

const ITEM_H = 44;
const PAD_ROWS = 2;
const PAD = PAD_ROWS * ITEM_H;

const MONTHS_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function parseYmd(s: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12) return null;
  const maxD = daysInMonth(y, m);
  if (d < 1 || d > maxD) return null;
  return { y, m, d };
}

function toYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatHeaderRu(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  try {
    return dt.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return `${d} ${MONTHS_GEN[m - 1] ?? ''} ${y}`;
  }
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
      backgroundColor: c.inputBackgroundSolid,
      paddingBottom: 8,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 10,
    },
    headerTitle: { fontSize: 16, fontWeight: '600', color: c.textPrimary },
    headerValue: { fontSize: 16, fontWeight: '600', color: c.accent, maxWidth: '55%' },
    wheelsWrap: {
      flexDirection: 'row',
      height: ITEM_H * 5,
      position: 'relative',
    },
    selectionBar: {
      position: 'absolute',
      left: 8,
      right: 8,
      top: PAD + ITEM_H * 2,
      height: ITEM_H,
      borderRadius: 10,
      backgroundColor: c.rowPressed,
    },
    col: { flex: 1 },
    wheelItem: {
      height: ITEM_H,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    wheelText: { fontSize: 17, color: c.textPrimary },
    wheelTextDim: { fontSize: 16, color: c.textSecondary },
    deleteBtn: {
      alignSelf: 'center',
      paddingVertical: 14,
      paddingHorizontal: 20,
    },
    deleteText: { fontSize: 16, fontWeight: '600', color: c.accent },
  });
}

type WheelColProps = {
  data: readonly string[];
  selectedIndex: number;
  onChangeIndex: (i: number) => void;
  listRef: React.RefObject<FlatList<string> | null>;
  dim?: boolean;
  listKey?: string;
};

function WheelColumn({ data, selectedIndex, onChangeIndex, listRef, dim, listKey }: WheelColProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const onMomentum = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const raw = Math.round(y / ITEM_H);
      const idx = Math.max(0, Math.min(data.length - 1, raw));
      if (idx !== raw) {
        listRef.current?.scrollToOffset({ offset: idx * ITEM_H, animated: true });
      }
      onChangeIndex(idx);
    },
    [data.length, listRef, onChangeIndex],
  );

  const onScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      onMomentum(e);
    },
    [onMomentum],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: string; index: number }) => {
      const active = index === selectedIndex;
      return (
        <View style={styles.wheelItem}>
          <Text
            numberOfLines={1}
            style={active ? styles.wheelText : dim ? styles.wheelTextDim : styles.wheelTextDim}
          >
            {item}
          </Text>
        </View>
      );
    },
    [dim, selectedIndex, styles.wheelItem, styles.wheelText, styles.wheelTextDim],
  );

  return (
    <FlatList
      key={listKey}
      ref={listRef}
      data={[...data]}
      keyExtractor={(item, i) => `${item}-${i}`}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      contentContainerStyle={{ paddingTop: PAD, paddingBottom: PAD }}
      onMomentumScrollEnd={onMomentum}
      onScrollEndDrag={onScrollEndDrag}
      getItemLayout={(_, index) => ({
        length: ITEM_H,
        offset: PAD + index * ITEM_H,
        index,
      })}
    />
  );
}

export type BirthdayWheelSheetProps = {
  visible: boolean;
  /** Текущее значение ГГГГ-ММ-ДД или пусто */
  valueYmd: string;
  onClose: () => void;
  /** Новая дата ГГГГ-ММ-ДД или пустая строка = удалить */
  onApply: (ymd: string) => void;
};

export function BirthdayWheelSheet({ visible, valueYmd, onClose, onApply }: BirthdayWheelSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const slide = useRef(new Animated.Value(0)).current;
  const maxYear = useMemo(() => new Date().getFullYear(), []);
  const minYear = maxYear - 100;
  const years = useMemo(
    () => Array.from({ length: maxYear - minYear + 1 }, (_, i) => String(maxYear - i)),
    [maxYear, minYear],
  );

  const [y, setY] = useState(() => new Date().getFullYear() - 25);
  const [m, setM] = useState(1);
  const [d, setD] = useState(1);

  const yearRef = useRef<FlatList<string>>(null);
  const monthRef = useRef<FlatList<string>>(null);
  const dayRef = useRef<FlatList<string>>(null);

  const maxD = useMemo(() => daysInMonth(y, m), [y, m]);
  const days = useMemo(
    () => Array.from({ length: maxD }, (_, i) => String(i + 1)),
    [maxD],
  );

  const yearIndex = useMemo(() => years.findIndex((s) => Number(s) === y), [years, y]);
  const monthIndex = m - 1;
  const dayIndex = Math.min(d - 1, maxD - 1);

  useEffect(() => {
    if (!visible) return;
    const p = parseYmd(valueYmd);
    const ny = p?.y ?? maxYear - 25;
    const nm = p?.m ?? 1;
    const nd = p?.d ?? 1;
    setY(ny);
    setM(nm);
    setD(nd);
    const yi = Math.max(0, years.findIndex((s) => Number(s) === ny));
    const mi = nm - 1;
    const maxDays = daysInMonth(ny, nm);
    const di = Math.min(nd, maxDays) - 1;
    requestAnimationFrame(() => {
      setTimeout(() => {
        yearRef.current?.scrollToOffset({ offset: yi * ITEM_H, animated: false });
        monthRef.current?.scrollToOffset({ offset: mi * ITEM_H, animated: false });
        dayRef.current?.scrollToOffset({ offset: Math.max(0, di) * ITEM_H, animated: false });
      }, 50);
    });
  }, [visible, valueYmd, maxYear, years]);

  useEffect(() => {
    if (d > maxD) setD(maxD);
  }, [maxD, d]);

  useEffect(() => {
    if (!visible) {
      slide.setValue(0);
      return;
    }
    const h = Dimensions.get('window').height;
    slide.setValue(h * 0.42);
    Animated.spring(slide, {
      toValue: 0,
      useNativeDriver: true,
      tension: 68,
      friction: 12,
    }).start();
  }, [visible, slide]);

  const applyAndClose = useCallback(() => {
    const dm = daysInMonth(y, m);
    const dd = Math.min(d, dm);
    onApply(toYmd(y, m, dd));
    onClose();
  }, [y, m, d, onApply, onClose]);

  const dismissAnimated = useCallback(
    (then: () => void) => {
      Animated.timing(slide, {
        toValue: Dimensions.get('window').height * 0.5,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) then();
      });
    },
    [slide],
  );

  const onBackdrop = useCallback(() => {
    dismissAnimated(applyAndClose);
  }, [dismissAnimated, applyAndClose]);

  const onDelete = useCallback(() => {
    onApply('');
    onClose();
  }, [onApply, onClose]);

  const setYearIndex = useCallback(
    (i: number) => {
      const yi = Math.max(0, Math.min(years.length - 1, i));
      const ny = Number(years[yi]);
      setY(ny);
      const cap = daysInMonth(ny, m);
      if (d > cap) setD(cap);
    },
    [years, m, d],
  );

  const setMonthIndex = useCallback(
    (i: number) => {
      const nm = Math.max(1, Math.min(12, i + 1));
      setM(nm);
      const cap = daysInMonth(y, nm);
      if (d > cap) setD(cap);
    },
    [y, d],
  );

  const setDayIndex = useCallback(
    (i: number) => {
      const cap = daysInMonth(y, m);
      const nd = Math.max(1, Math.min(cap, i + 1));
      setD(nd);
    },
    [y, m],
  );

  const headerText = formatHeaderRu(y, m, Math.min(d, maxD));
  const safeYearIndex = Math.max(0, yearIndex);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onBackdrop}>
      <Pressable style={styles.overlay} onPress={onBackdrop}>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 12) + 8, transform: [{ translateY: slide }] },
          ]}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>День рождения</Text>
              <Text style={styles.headerValue} numberOfLines={1}>
                {headerText}
              </Text>
            </View>
            <View style={styles.wheelsWrap}>
              <View style={styles.selectionBar} pointerEvents="none" />
              <View style={[styles.col, { flex: 0.85 }]}>
                <WheelColumn
                  data={days}
                  selectedIndex={dayIndex}
                  onChangeIndex={setDayIndex}
                  listRef={dayRef}
                  listKey={`bd-${y}-${m}-${maxD}`}
                />
              </View>
              <View style={[styles.col, { flex: 1.35 }]}>
                <WheelColumn
                  data={MONTHS_GEN as unknown as string[]}
                  selectedIndex={monthIndex}
                  onChangeIndex={setMonthIndex}
                  listRef={monthRef}
                  dim
                />
              </View>
              <View style={[styles.col, { flex: 1 }]}>
                <WheelColumn
                  data={years}
                  selectedIndex={safeYearIndex}
                  onChangeIndex={setYearIndex}
                  listRef={yearRef}
                />
              </View>
            </View>
            <Pressable style={styles.deleteBtn} onPress={onDelete}>
              <Text style={styles.deleteText}>Удалить день рождения</Text>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/** Подпись строки «День рождения» в форме редактирования. */
export function formatBirthdayRowLabel(ymd: string): string {
  const p = parseYmd(ymd.trim());
  if (!p) return 'Не указан';
  return formatHeaderRu(p.y, p.m, p.d);
}
