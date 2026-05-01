import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, {
  Easing,
  cancelAnimation,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

const CELL = 8;
const MAX_CELLS = 72;
const DURATION_MS = 480;

type PixelSpec = {
  key: string;
  left: number;
  top: number;
  dx: number;
  dy: number;
  /** When global progress crosses this (0..1), this pixel starts moving. */
  delayStart: number;
  rotDeg: number;
  bg: string;
};

function hashSeed(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function makePixelSpecs(
  width: number,
  height: number,
  bubbleRgb: { r: number; g: number; b: number },
  seed: string,
): PixelSpec[] {
  if (width <= 0 || height <= 0) return [];
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const total = Math.min(cols * rows, MAX_CELLS);
  const h = hashSeed(seed);
  const out: PixelSpec[] = [];
  for (let i = 0; i < total; i += 1) {
    const rnd = ((h + i * 1103515245) >>> 0) / 0xffffffff;
    const rnd2 = ((h + i * 7919) >>> 0) / 0xffffffff;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = col * CELL;
    const top = row * CELL;
    const dx = (rnd - 0.5) * 64;
    const dy = -12 - rnd2 * 52;
    const jitter = ((h >> (i % 17)) & 0xff) / 255;
    const alpha = 0.22 + jitter * 0.36;
    const bg = `rgba(${bubbleRgb.r},${bubbleRgb.g},${bubbleRgb.b},${alpha})`;
    const delayStart = (i / Math.max(total, 1)) * 0.32;
    const rotDeg = (rnd - 0.5) * 22;
    out.push({
      key: `${col}-${row}-${i}`,
      left,
      top,
      dx,
      dy,
      delayStart,
      rotDeg,
      bg,
    });
  }
  return out;
}

const DissolvePixel = React.memo(function DissolvePixel({
  progress,
  spec,
}: {
  progress: SharedValue<number>;
  spec: PixelSpec;
}) {
  const style = useAnimatedStyle(() => {
    'worklet';
    const t = progress.value;
    const u = interpolate(t, [spec.delayStart, 1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(u, [0, 0.14, 0.48, 1], [0, 0.95, 0.5, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: spec.dx * u },
        { translateY: spec.dy * u },
        { rotate: `${spec.rotDeg * u}deg` },
      ],
    };
  });

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        styles.pixel,
        { left: spec.left, top: spec.top, backgroundColor: spec.bg },
        style,
      ]}
    />
  );
});

type Props = {
  messageKey: string;
  dustRgb: { r: number; g: number; b: number };
  onDissolveComplete: () => void;
  children: React.ReactNode;
};

/**
 * Deleted message: shell fades / lifts on Reanimated + pixel scatter overlay (same progress).
 */
export function DeletedMessageDissolve({
  messageKey,
  dustRgb,
  onDissolveComplete,
  children,
}: Props) {
  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const progress = useSharedValue(0);
  const runGen = useSharedValue(0);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onDissolveComplete);
  onCompleteRef.current = onDissolveComplete;

  const specs = useMemo(
    () => makePixelSpecs(layout.w, layout.h, dustRgb, messageKey),
    [layout.w, layout.h, dustRgb, messageKey],
  );

  const fireComplete = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    if (layout.w <= 0 || layout.h <= 0) {
      const t = setTimeout(() => fireComplete(), 520);
      return () => clearTimeout(t);
    }
    doneRef.current = false;
    cancelAnimation(progress);
    progress.value = 0;
    runGen.value = runGen.value + 1;
    const myGen = runGen.value;

    progress.value = withTiming(
      1,
      { duration: DURATION_MS, easing: Easing.out(Easing.cubic) },
      (_finished) => {
        'worklet';
        if (runGen.value !== myGen) return;
        runOnJS(fireComplete)();
      },
    );

    return () => {
      cancelAnimation(progress);
    };
  }, [messageKey, layout.w, layout.h, progress, fireComplete, runGen]);

  const shellStyle = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: interpolate(t, [0, 0.1, 1], [1, 1, 0]),
      transform: [
        { translateY: interpolate(t, [0, 1], [0, -10]) },
        { scale: interpolate(t, [0, 0.22, 1], [1, 1.02, 1.01]) },
      ],
    };
  });

  return (
    <View
      style={styles.wrap}
      collapsable={false}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0 && (width !== layout.w || height !== layout.h)) {
          setLayout({ w: width, h: height });
        }
      }}
    >
      {/* Particles inside the same animated shell so opacity/scale apply to the whole dissolve. */}
      <Reanimated.View style={[styles.shell, shellStyle]} collapsable={false}>
        <View style={styles.content}>{children}</View>
        {layout.w > 0 && layout.h > 0 && specs.length > 0 ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.pixelLayer]}>
            {specs.map((s) => (
              <DissolvePixel key={s.key} progress={progress} spec={s} />
            ))}
          </View>
        ) : null}
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignSelf: 'stretch',
    overflow: 'visible',
  },
  shell: {
    position: 'relative',
    alignSelf: 'stretch',
    overflow: 'visible',
  },
  content: {
    alignSelf: 'stretch',
  },
  pixelLayer: {
    overflow: 'hidden',
    borderRadius: 18,
    zIndex: 2,
  },
  pixel: {
    position: 'absolute',
    width: CELL - 1,
    height: CELL - 1,
    borderRadius: 1,
  },
});
