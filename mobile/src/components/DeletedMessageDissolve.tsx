import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
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

/** Плотнее сетка для «пыли» без изображения. */
const SOLID_CELL = 5;
const SOLID_MAX_CELLS = 220;
/** Крупнее ячейка для фрагментов картинки (дороже по Image count). */
const IMAGE_CELL = 7;
const IMAGE_MAX_FRAGMENTS = 112;

const DURATION_MS = 720;
const LAYOUT_WAIT_MS = 2600;

export type DissolveFragmentShape = 'rect' | 'circle';

type SolidPixelSpec = {
  kind: 'solid';
  key: string;
  left: number;
  top: number;
  dx: number;
  dy: number;
  size: number;
  delayStart: number;
  rotDeg: number;
  bg: string;
};

type ImageFragmentSpec = {
  kind: 'image';
  key: string;
  left: number;
  top: number;
  cw: number;
  ch: number;
  dx: number;
  dy: number;
  delayStart: number;
  rotDeg: number;
  /** Круглые «чешуйки» для video note. */
  roundClip: boolean;
};

type PixelSpec = SolidPixelSpec | ImageFragmentSpec;

function hashSeed(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function makeSolidPixelSpecs(
  width: number,
  height: number,
  bubbleRgb: { r: number; g: number; b: number },
  seed: string,
): SolidPixelSpec[] {
  if (width <= 0 || height <= 0) return [];
  const cols = Math.ceil(width / SOLID_CELL);
  const rows = Math.ceil(height / SOLID_CELL);
  const total = Math.min(cols * rows, SOLID_MAX_CELLS);
  const h = hashSeed(seed);
  const out: SolidPixelSpec[] = [];
  for (let i = 0; i < total; i += 1) {
    const rnd = ((h + i * 1103515245) >>> 0) / 0xffffffff;
    const rnd2 = ((h + i * 7919) >>> 0) / 0xffffffff;
    const rnd3 = ((h + i * 2654435761) >>> 0) / 0xffffffff;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = col * SOLID_CELL;
    const top = row * SOLID_CELL;
    const dx = (rnd - 0.5) * 112;
    const dy = -26 - rnd2 * 92;
    const jitter = ((h >> (i % 17)) & 0xff) / 255;
    const alpha = 0.58 + jitter * 0.36;
    const r = Math.min(255, Math.round(bubbleRgb.r * 1.12 + 28));
    const g = Math.min(255, Math.round(bubbleRgb.g * 1.12 + 28));
    const b = Math.min(255, Math.round(bubbleRgb.b * 1.12 + 28));
    const bg = `rgba(${r},${g},${b},${alpha})`;
    const delayStart = (i / Math.max(total, 1)) * 0.2;
    const rotDeg = (rnd - 0.5) * 58;
    const size = 4 + Math.round(rnd3 * 5);
    out.push({
      kind: 'solid',
      key: `s-${col}-${row}-${i}`,
      left,
      top,
      dx,
      dy,
      size,
      delayStart,
      rotDeg,
      bg,
    });
  }
  return out;
}

function makeImageFragmentSpecs(
  width: number,
  height: number,
  seed: string,
  shape: DissolveFragmentShape,
): ImageFragmentSpec[] {
  if (width <= 0 || height <= 0) return [];
  const cols = Math.ceil(width / IMAGE_CELL);
  const rows = Math.ceil(height / IMAGE_CELL);
  const total = Math.min(cols * rows, IMAGE_MAX_FRAGMENTS);
  const h = hashSeed(seed);
  const out: ImageFragmentSpec[] = [];
  const roundClip = shape === 'circle';
  for (let i = 0; i < total; i += 1) {
    const rnd = ((h + i * 1103515245) >>> 0) / 0xffffffff;
    const rnd2 = ((h + i * 7919) >>> 0) / 0xffffffff;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = col * IMAGE_CELL;
    const top = row * IMAGE_CELL;
    const cw = Math.min(IMAGE_CELL, width - left);
    const ch = Math.min(IMAGE_CELL, height - top);
    if (cw <= 0 || ch <= 0) continue;
    const dx = (rnd - 0.5) * 108;
    const dy = -24 - rnd2 * 88;
    const delayStart = (i / Math.max(total, 1)) * 0.18;
    const rotDeg = (rnd - 0.5) * 52;
    out.push({
      kind: 'image',
      key: `i-${col}-${row}-${i}`,
      left,
      top,
      cw,
      ch,
      dx,
      dy,
      delayStart,
      rotDeg,
      roundClip,
    });
  }
  return out;
}

const DissolveSolidPixel = React.memo(function DissolveSolidPixel({
  progress,
  spec,
}: {
  progress: SharedValue<number>;
  spec: SolidPixelSpec;
}) {
  const style = useAnimatedStyle<ViewStyle>(() => {
    'worklet';
    const t = progress.value;
    const u = interpolate(t, [spec.delayStart, 1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(u, [0, 0.06, 0.58, 1], [0, 1, 0.78, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: spec.dx * u },
        { translateY: spec.dy * u },
        { scale: interpolate(u, [0, 0.14, 1], [0.35, 1.12, 0.32], Extrapolation.CLAMP) },
        { rotate: `${spec.rotDeg * u}deg` },
      ] as ViewStyle['transform'],
    };
  });

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        styles.pixel,
        {
          left: spec.left,
          top: spec.top,
          width: spec.size,
          height: spec.size,
          backgroundColor: spec.bg,
        },
        style,
      ]}
    />
  );
});

const DissolveImageFragment = React.memo(function DissolveImageFragment({
  progress,
  spec,
  imageUri,
  layoutW,
  layoutH,
}: {
  progress: SharedValue<number>;
  spec: ImageFragmentSpec;
  imageUri: string;
  layoutW: number;
  layoutH: number;
}) {
  const style = useAnimatedStyle<ViewStyle>(() => {
    'worklet';
    const t = progress.value;
    const u = interpolate(t, [spec.delayStart, 1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(u, [0, 0.05, 0.55, 1], [0, 1, 0.85, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: spec.dx * u },
        { translateY: spec.dy * u },
        { scale: interpolate(u, [0, 0.12, 1], [0.4, 1.08, 0.3], Extrapolation.CLAMP) },
        { rotate: `${spec.rotDeg * u}deg` },
      ] as ViewStyle['transform'],
    };
  });

  const r = Math.min(spec.cw, spec.ch) / 2;

  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        styles.fragClip,
        {
          left: spec.left,
          top: spec.top,
          width: spec.cw,
          height: spec.ch,
          borderRadius: spec.roundClip ? r : 1,
        },
        style,
      ]}
    >
      <Image
        source={{ uri: imageUri }}
        style={{
          position: 'absolute',
          left: -spec.left,
          top: -spec.top,
          width: layoutW,
          height: layoutH,
        }}
        contentFit="fill"
        cachePolicy="disk"
      />
    </Reanimated.View>
  );
});

type Props = {
  messageKey: string;
  dustRgb: { r: number; g: number; b: number };
  /** Превью/картинка: частицы — срезы этого изображения (цвет как у фото). */
  fragmentImageUri?: string | null;
  fragmentShape?: DissolveFragmentShape;
  onDissolveComplete: () => void;
  children: React.ReactNode;
};

/**
 * Удалённое сообщение: контент гаснет на Reanimated + слой частиц (цвет пузыря или фрагменты фото).
 */
export function DeletedMessageDissolve({
  messageKey,
  dustRgb,
  fragmentImageUri,
  fragmentShape = 'rect',
  onDissolveComplete,
  children,
}: Props) {
  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const progress = useSharedValue(0);
  const runGen = useSharedValue(0);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onDissolveComplete);
  onCompleteRef.current = onDissolveComplete;

  const useImage = Boolean(fragmentImageUri?.trim());

  const specs = useMemo((): PixelSpec[] => {
    if (layout.w <= 0 || layout.h <= 0) return [];
    if (useImage && fragmentImageUri) {
      return makeImageFragmentSpecs(layout.w, layout.h, messageKey, fragmentShape);
    }
    return makeSolidPixelSpecs(layout.w, layout.h, dustRgb, messageKey);
  }, [layout.w, layout.h, dustRgb, messageKey, useImage, fragmentImageUri, fragmentShape]);

  const fireComplete = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    if (layout.w <= 0 || layout.h <= 0) {
      const t = setTimeout(() => fireComplete(), LAYOUT_WAIT_MS);
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

  const contentStyle = useAnimatedStyle<ViewStyle>(() => {
    const t = progress.value;
    return {
      opacity: interpolate(t, [0, 0.28, 0.62], [1, 0.55, 0], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(t, [0, 1], [0, -6]) }] as ViewStyle['transform'],
    };
  });

  const particleLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.06, 0.9, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
  }));

  const uri = fragmentImageUri?.trim() ?? '';

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
      <Reanimated.View style={[styles.shell, contentStyle]} collapsable={false}>
        <View style={styles.content}>{children}</View>
      </Reanimated.View>
      {layout.w > 0 && layout.h > 0 && specs.length > 0 ? (
        <Reanimated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.pixelLayer, particleLayerStyle]}
        >
          {specs.map((s) =>
            s.kind === 'solid' ? (
              <DissolveSolidPixel key={s.key} progress={progress} spec={s} />
            ) : (
              <DissolveImageFragment
                key={s.key}
                progress={progress}
                spec={s}
                imageUri={uri}
                layoutW={layout.w}
                layoutH={layout.h}
              />
            ),
          )}
        </Reanimated.View>
      ) : null}
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
    overflow: 'visible',
    borderRadius: 18,
    zIndex: 20,
  },
  pixel: {
    position: 'absolute',
    borderRadius: 1,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.22,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  fragClip: {
    position: 'absolute',
    overflow: 'hidden',
  },
});
