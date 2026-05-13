import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { ChatTheme } from '../theme/chatThemes';
import type { ResolvedColorScheme } from '../theme/palettes';

/** Верх экрана — розово-фиолетовый; низ — сине-стальной (как срез вертикальной палитры в Telegram). */
const SCREEN_GRADIENT_TOP = '#D565F0';
const SCREEN_GRADIENT_BOTTOM = '#4F6AA8';

function clamp01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '').trim();
  const full =
    h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  if (full.length !== 6) return null;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpScreenColor(t: number): string {
  const tClamped = clamp01(t);
  const A = parseHex(SCREEN_GRADIENT_TOP);
  const B = parseHex(SCREEN_GRADIENT_BOTTOM);
  if (!A || !B) return SCREEN_GRADIENT_BOTTOM;
  const r = lerpChannel(A.r, B.r, tClamped);
  const g = lerpChannel(A.g, B.g, tClamped);
  const b = lerpChannel(A.b, B.b, tClamped);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Два цвета для вертикального LinearGradient внутри бабла: соответствуют «глобальной» вертикальной
 * палитре в точках верха и низа бабла в координатах окна (как в Telegram Android).
 */
export function bubbleVerticalGradientPair(
  bubbleTopInWindow: number,
  bubbleHeight: number,
  windowHeight: number,
): [string, string] {
  const H = Math.max(1, windowHeight);
  const h = Math.max(1, bubbleHeight);
  const topT = clamp01(bubbleTopInWindow / H);
  const bottomT = clamp01((bubbleTopInWindow + h) / H);
  return [lerpScreenColor(topT), lerpScreenColor(bottomT)];
}

export function shouldUseDarkDefaultOutgoingBubbleGradient(
  chatTheme: ChatTheme,
  resolvedScheme: ResolvedColorScheme,
): boolean {
  return resolvedScheme === 'dark' && chatTheme.id === 'default';
}

type ShellProps = {
  scrollTick: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * Фон исходящего бабла: вертикальный градиент, привязанный к положению на экране; обновляется при `scrollTick`.
 * В `style` передают скругления (в т.ч. асимметричные из `bubbleRadius.mine`) — родитель обрезает градиент.
 */
export function OutgoingBubbleGradientShell({ scrollTick, style, children }: ShellProps) {
  const { height: winH } = useWindowDimensions();
  const wrapRef = useRef<View>(null);
  const [pair, setPair] = useState<[string, string]>(() =>
    bubbleVerticalGradientPair(winH * 0.35, winH * 0.12, winH),
  );

  const applyMeasure = useCallback(() => {
    wrapRef.current?.measureInWindow((_, y, __, h) => {
      const next = bubbleVerticalGradientPair(y, Math.max(1, h), winH);
      setPair((prev) => (prev[0] === next[0] && prev[1] === next[1] ? prev : next));
    });
  }, [winH]);

  useLayoutEffect(() => {
    applyMeasure();
  }, [applyMeasure, scrollTick, winH]);

  return (
    <View
      ref={wrapRef}
      collapsable={false}
      style={[style, { overflow: 'hidden', backgroundColor: 'transparent' }]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={pair}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.foreground}>{children}</View>
    </View>
  );
}

type ChromeProps = {
  active: boolean;
  scrollTick: number;
  fillColor: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/** Либо сплошной `fillColor`, либо экранный градиент для тёмного default. */
export function MeBubbleChrome({ active, scrollTick, fillColor, style, children }: ChromeProps) {
  if (!active) {
    return <View style={[style, { backgroundColor: fillColor }]}>{children}</View>;
  }
  return (
    <OutgoingBubbleGradientShell scrollTick={scrollTick} style={style}>
      {children}
    </OutgoingBubbleGradientShell>
  );
}

const styles = StyleSheet.create({
  foreground: {
  },
});
