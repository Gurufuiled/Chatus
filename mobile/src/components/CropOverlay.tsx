import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const MIN_CROP = 60;
const HANDLE_SIZE = 28;
const HANDLE_HIT = 36;
const GRID_LINES = 2;

type Rect = { x: number; y: number; w: number; h: number };

type CropOverlayProps = {
  uri: string;
  onConfirm: (croppedUri: string) => void;
  onCancel: () => void;
};

type DragTarget =
  | 'tl' | 'tr' | 'bl' | 'br'
  | 'top' | 'bottom' | 'left' | 'right'
  | 'body'
  | null;

function getImageDisplayRect(
  imgW: number,
  imgH: number,
  containerW: number,
  containerH: number,
): Rect {
  const imgAspect = imgW / imgH;
  const contAspect = containerW / containerH;
  let w: number;
  let h: number;
  if (imgAspect > contAspect) {
    w = containerW;
    h = containerW / imgAspect;
  } else {
    h = containerH;
    w = containerH * imgAspect;
  }
  return {
    x: (containerW - w) / 2,
    y: (containerH - h) / 2,
    w,
    h,
  };
}

function hitTest(tx: number, ty: number, crop: Rect): DragTarget {
  const { x, y, w, h } = crop;
  const r = HANDLE_HIT;
  if (Math.abs(tx - x) < r && Math.abs(ty - y) < r) return 'tl';
  if (Math.abs(tx - (x + w)) < r && Math.abs(ty - y) < r) return 'tr';
  if (Math.abs(tx - x) < r && Math.abs(ty - (y + h)) < r) return 'bl';
  if (Math.abs(tx - (x + w)) < r && Math.abs(ty - (y + h)) < r) return 'br';
  if (Math.abs(ty - y) < r && tx > x + r && tx < x + w - r) return 'top';
  if (Math.abs(ty - (y + h)) < r && tx > x + r && tx < x + w - r) return 'bottom';
  if (Math.abs(tx - x) < r && ty > y + r && ty < y + h - r) return 'left';
  if (Math.abs(tx - (x + w)) < r && ty > y + r && ty < y + h - r) return 'right';
  if (tx > x && tx < x + w && ty > y && ty < y + h) return 'body';
  return null;
}

function clampRect(rect: Rect, bounds: Rect): Rect {
  let { x, y, w, h } = rect;
  w = Math.max(MIN_CROP, Math.min(w, bounds.w));
  h = Math.max(MIN_CROP, Math.min(h, bounds.h));
  x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.w - w));
  y = Math.max(bounds.y, Math.min(y, bounds.y + bounds.h - h));
  return { x, y, w, h };
}

const CropGrid = React.memo(function CropGrid({ crop }: { crop: Rect }) {
  const lines: React.ReactNode[] = [];
  for (let i = 1; i <= GRID_LINES; i++) {
    const hY = crop.y + (crop.h * i) / (GRID_LINES + 1);
    const vX = crop.x + (crop.w * i) / (GRID_LINES + 1);
    lines.push(
      <View
        key={`h${i}`}
        style={[styles.gridLine, { top: hY, left: crop.x, width: crop.w, height: StyleSheet.hairlineWidth * 2 }]}
      />,
      <View
        key={`v${i}`}
        style={[styles.gridLine, { top: crop.y, left: vX, width: StyleSheet.hairlineWidth * 2, height: crop.h }]}
      />,
    );
  }
  return <>{lines}</>;
});

const CropHandles = React.memo(function CropHandles({ crop }: { crop: Rect }) {
  const L = HANDLE_SIZE;
  const T = 3;
  const corners = [
    { top: crop.y - T, left: crop.x - T },
    { top: crop.y - T, left: crop.x + crop.w - L + T },
    { top: crop.y + crop.h - L + T, left: crop.x - T },
    { top: crop.y + crop.h - L + T, left: crop.x + crop.w - L + T },
  ];

  return (
    <>
      {corners.map((c, i) => (
        <View key={i} pointerEvents="none" style={[styles.cornerHandle, { top: c.top, left: c.left }]}>
          <View
            style={[
              styles.cornerBar,
              { width: L, height: T, top: i < 2 ? 0 : L - T, left: 0 },
            ]}
          />
          <View
            style={[
              styles.cornerBar,
              { width: T, height: L, top: 0, left: i % 2 === 0 ? 0 : L - T },
            ]}
          />
        </View>
      ))}
    </>
  );
});

export const CropOverlay = React.memo(function CropOverlay({
  uri,
  onConfirm,
  onCancel,
}: CropOverlayProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({
    w: SCREEN_WIDTH,
    h: SCREEN_HEIGHT,
  });
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    setImgSize(null);
    setImageReady(false);
  }, [uri]);

  const imageRect = useMemo(() => {
    if (!imgSize) {
      return { x: 0, y: 0, w: containerSize.w, h: containerSize.h };
    }
    return getImageDisplayRect(imgSize.w, imgSize.h, containerSize.w, containerSize.h);
  }, [imgSize, containerSize]);

  const [cropRect, setCropRect] = useState<Rect>(imageRect);
  const cropRef = useRef(cropRect);

  useEffect(() => {
    setCropRect(imageRect);
    cropRef.current = imageRect;
  }, [imageRect]);

  const dragTargetRef = useRef<DragTarget>(null);
  const startCropRef = useRef<Rect>(imageRect);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          const { locationX, locationY } = e.nativeEvent;
          dragTargetRef.current = hitTest(locationX, locationY, cropRef.current);
          startCropRef.current = { ...cropRef.current };
        },
        onPanResponderMove: (_: GestureResponderEvent, g: PanResponderGestureState) => {
          const target = dragTargetRef.current;
          if (!target) return;

          const start = startCropRef.current;
          let next: Rect;

          switch (target) {
            case 'body':
              next = clampRect(
                { x: start.x + g.dx, y: start.y + g.dy, w: start.w, h: start.h },
                imageRect,
              );
              break;
            case 'tl':
              next = {
                x: start.x + g.dx,
                y: start.y + g.dy,
                w: start.w - g.dx,
                h: start.h - g.dy,
              };
              break;
            case 'tr':
              next = {
                x: start.x,
                y: start.y + g.dy,
                w: start.w + g.dx,
                h: start.h - g.dy,
              };
              break;
            case 'bl':
              next = {
                x: start.x + g.dx,
                y: start.y,
                w: start.w - g.dx,
                h: start.h + g.dy,
              };
              break;
            case 'br':
              next = {
                x: start.x,
                y: start.y,
                w: start.w + g.dx,
                h: start.h + g.dy,
              };
              break;
            case 'top':
              next = {
                x: start.x,
                y: start.y + g.dy,
                w: start.w,
                h: start.h - g.dy,
              };
              break;
            case 'bottom':
              next = { x: start.x, y: start.y, w: start.w, h: start.h + g.dy };
              break;
            case 'left':
              next = {
                x: start.x + g.dx,
                y: start.y,
                w: start.w - g.dx,
                h: start.h,
              };
              break;
            case 'right':
              next = { x: start.x, y: start.y, w: start.w + g.dx, h: start.h };
              break;
            default:
              return;
          }

          next.w = Math.max(MIN_CROP, next.w);
          next.h = Math.max(MIN_CROP, next.h);
          next.x = Math.max(imageRect.x, Math.min(next.x, imageRect.x + imageRect.w - next.w));
          next.y = Math.max(imageRect.y, Math.min(next.y, imageRect.y + imageRect.h - next.h));
          next.w = Math.min(next.w, imageRect.x + imageRect.w - next.x);
          next.h = Math.min(next.h, imageRect.y + imageRect.h - next.y);

          cropRef.current = next;
          setCropRect(next);
        },
        onPanResponderRelease: () => {
          dragTargetRef.current = null;
        },
      }),
    [imageRect],
  );

  const handleReset = useCallback(() => {
    setCropRect(imageRect);
    cropRef.current = imageRect;
  }, [imageRect]);

  const handleConfirm = useCallback(async () => {
    if (!imgSize || processing || !imageReady) return;
    setProcessing(true);
    try {
      const scaleX = imgSize.w / imageRect.w;
      const scaleY = imgSize.h / imageRect.h;
      let originX = Math.round((cropRect.x - imageRect.x) * scaleX);
      let originY = Math.round((cropRect.y - imageRect.y) * scaleY);
      let width = Math.round(cropRect.w * scaleX);
      let height = Math.round(cropRect.h * scaleY);

      originX = Math.max(0, Math.min(originX, imgSize.w - 1));
      originY = Math.max(0, Math.min(originY, imgSize.h - 1));
      width = Math.max(1, Math.min(width, imgSize.w - originX));
      height = Math.max(1, Math.min(height, imgSize.h - originY));

      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ crop: { originX, originY, width, height } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
      );
      onConfirm(result.uri);
    } catch (err) {
      if (__DEV__) console.warn('[CropOverlay] crop error:', err);
      onCancel();
    } finally {
      setProcessing(false);
    }
  }, [cropRect, imageReady, imageRect, imgSize, onCancel, onConfirm, processing, uri]);

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({ w: width, h: height });
  }, []);

  const maskTop = { top: 0, left: 0, right: 0, height: Math.max(0, cropRect.y) };
  const maskBottom = {
    top: cropRect.y + cropRect.h,
    left: 0,
    right: 0,
    bottom: 0,
  };
  const maskLeft = {
    top: cropRect.y,
    left: 0,
    width: Math.max(0, cropRect.x),
    height: cropRect.h,
  };
  const maskRight = {
    top: cropRect.y,
    left: cropRect.x + cropRect.w,
    right: 0,
    height: cropRect.h,
  };

  return (
    <View style={styles.root} onLayout={onContainerLayout}>
      <Image
        source={{ uri }}
        style={styles.bgImage}
        contentFit="contain"
        cachePolicy="memory-disk"
        onLoad={(e) => {
          const w = e.source.width;
          const h = e.source.height;
          if (w > 0 && h > 0) {
            setImgSize({ w, h });
            setImageReady(true);
          }
        }}
        onError={() => {
          if (__DEV__) console.warn('[CropOverlay] image load failed:', uri);
        }}
      />

      {imgSize ? (
        <>
          <View style={[styles.mask, maskTop]} pointerEvents="none" />
          <View style={[styles.mask, maskBottom]} pointerEvents="none" />
          <View style={[styles.mask, maskLeft]} pointerEvents="none" />
          <View style={[styles.mask, maskRight]} pointerEvents="none" />
          <CropGrid crop={cropRect} />
          <CropHandles crop={cropRect} />
          <View
            style={[
              styles.cropBorder,
              {
                top: cropRect.y,
                left: cropRect.x,
                width: cropRect.w,
                height: cropRect.h,
              },
            ]}
            pointerEvents="none"
          />
        </>
      ) : null}

      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} />

      {/* Верх: СБРОС по центру (как в Telegram) */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [styles.resetBtn, pressed && styles.toolBtnPressed]}
          onPress={handleReset}
          disabled={!imgSize}
        >
          <Text style={styles.resetText}>СБРОС</Text>
        </Pressable>
      </View>

      {/* Низ: отмена ··· подтверждение */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 8) + 10 }]}>
        <Pressable
          style={({ pressed }) => [styles.roundBtn, pressed && styles.toolBtnPressed]}
          onPress={onCancel}
          hitSlop={8}
        >
          <Feather name="x" size={26} color="#FFFFFF" />
        </Pressable>

        <View style={styles.bottomSpacer} />

        <Pressable
          style={({ pressed }) => [
            styles.roundBtn,
            styles.confirmBtn,
            { backgroundColor: colors.accent },
            pressed && styles.toolBtnPressed,
          ]}
          onPress={() => void handleConfirm()}
          disabled={processing || !imgSize}
          hitSlop={8}
        >
          <Feather name="check" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: '#000000',
  },
  bgImage: {
    width: '100%',
    height: '100%',
  },
  mask: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  cropBorder: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  cornerHandle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  },
  cornerBar: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 110,
  },
  resetBtn: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  resetText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    zIndex: 110,
  },
  bottomSpacer: {
    flex: 1,
  },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  confirmBtn: {
    backgroundColor: '#3390EC',
  },
  toolBtnPressed: {
    opacity: 0.6,
  },
});
