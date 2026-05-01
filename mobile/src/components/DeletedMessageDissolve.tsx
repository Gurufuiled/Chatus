import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const CELL = 9;
const MAX_CELLS = 88;
const DURATION_MS = 440;

type PixelSpec = {
  key: string;
  left: number;
  top: number;
  dx: number;
  dy: number;
  delay: number;
  bg: string;
};

function hashSeed(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function makePixels(
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
    const dx = (rnd - 0.5) * 58;
    const dy = -16 - rnd2 * 54;
    const jitter = ((h >> (i % 17)) & 0xff) / 255;
    const alpha = 0.2 + jitter * 0.38;
    const bg = `rgba(${bubbleRgb.r},${bubbleRgb.g},${bubbleRgb.b},${alpha})`;
    out.push({
      key: `${col}-${row}-${i}`,
      left,
      top,
      dx,
      dy,
      delay: Math.floor((i / Math.max(total, 1)) * 120),
      bg,
    });
  }
  return out;
}

type Props = {
  messageKey: string;
  dustRgb: { r: number; g: number; b: number };
  onDissolveComplete: () => void;
  children: React.ReactNode;
};

export function DeletedMessageDissolve({
  messageKey,
  dustRgb,
  onDissolveComplete,
  children,
}: Props) {
  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const shellOpacity = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(false);
  /** Parent often passes an inline callback — keep effect deps stable. */
  const onCompleteRef = useRef(onDissolveComplete);
  onCompleteRef.current = onDissolveComplete;

  const pixels = useMemo(
    () => makePixels(layout.w, layout.h, dustRgb, messageKey),
    [layout.w, layout.h, dustRgb, messageKey],
  );

  const pixelAnims = useRef<Animated.Value[]>([]);
  if (pixelAnims.current.length !== pixels.length) {
    pixelAnims.current = pixels.map(() => new Animated.Value(0));
  }

  /** Lets interrupted animations distinguish “new effect started” vs unmount (see microtask in onEnd). */
  const dissolveRunIdRef = useRef(0);

  const fireComplete = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    const fallback = setTimeout(() => {
      if (layout.w <= 0 && layout.h <= 0) {
        fireComplete();
      }
    }, 520);
    return () => clearTimeout(fallback);
  }, [fireComplete, layout.h, layout.w]);

  useEffect(() => {
    if (layout.w <= 0 || layout.h <= 0) return;

    const myRunId = ++dissolveRunIdRef.current;
    doneRef.current = false;
    shellOpacity.setValue(1);
    for (const v of pixelAnims.current) {
      v.setValue(0);
    }

    const pixelSpecs = makePixels(layout.w, layout.h, dustRgb, messageKey);
    const pixelRuns = pixelSpecs.map((p, i) => {
      const v = pixelAnims.current[i];
      if (!v) return null;
      return Animated.sequence([
        Animated.delay(p.delay),
        Animated.timing(v, {
          toValue: 1,
          duration: DURATION_MS - 100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]);
    }).filter(Boolean) as Animated.CompositeAnimation[];

    const parallel = Animated.parallel([
      Animated.timing(shellOpacity, {
        toValue: 0,
        duration: DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      ...pixelRuns,
    ]);

    const onEnd = ({ finished }: { finished: boolean }) => {
      if (dissolveRunIdRef.current !== myRunId) return;
      if (finished) {
        fireComplete();
        return;
      }
      // stop() from effect cleanup: defer so a follow-up effect run can bump runId first.
      queueMicrotask(() => {
        if (dissolveRunIdRef.current !== myRunId) return;
        fireComplete();
      });
    };

    parallel.start(onEnd);

    return () => {
      parallel.stop();
      shellOpacity.stopAnimation();
      for (const v of pixelAnims.current) {
        v.stopAnimation();
      }
    };
  }, [dustRgb, fireComplete, layout.h, layout.w, messageKey, shellOpacity]);

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0 && (width !== layout.w || height !== layout.h)) {
          setLayout({ w: width, h: height });
        }
      }}
    >
      <Animated.View style={[styles.content, { opacity: shellOpacity }]}>{children}</Animated.View>

      {layout.w > 0 && layout.h > 0 ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.pixelLayer]}>
          {pixels.map((p, i) => {
            const anim = pixelAnims.current[i];
            if (!anim) return null;
            const translateX = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, p.dx],
            });
            const translateY = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, p.dy],
            });
            const pixOpacity = anim.interpolate({
              inputRange: [0, 0.12, 0.55, 1],
              outputRange: [0, 0.95, 0.55, 0],
            });
            return (
              <Animated.View
                key={p.key}
                style={[
                  styles.pixel,
                  {
                    left: p.left,
                    top: p.top,
                    backgroundColor: p.bg,
                    opacity: pixOpacity,
                    transform: [{ translateX }, { translateY }, { rotate: `${(p.dx % 18) - 9}deg` }],
                  },
                ]}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignSelf: 'stretch',
  },
  content: {
    alignSelf: 'stretch',
  },
  pixelLayer: {
    overflow: 'hidden',
    borderRadius: 18,
  },
  pixel: {
    position: 'absolute',
    width: CELL - 1,
    height: CELL - 1,
    borderRadius: 1,
  },
});
