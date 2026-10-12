/**
 * useHeroDismiss — закрытие полноэкранного фото свайпом «как в Telegram».
 *
 * - Фото следует за пальцем, уменьшается; фон и панели светлеют (виден чат под ним).
 * - При отпускании (расстояние/бросок) фото «подхватывается» рамкой и летит на место своей миниатюры,
 *   сужаясь до её размера с обрезкой по краям (`cover`) — без выхода за границы плитки.
 * - Если миниатюры нет на экране — фото плавно уходит по направлению жеста и гаснет.
 * - При открытии фото «вырастает» из миниатюры тем же путём.
 * - Кнопка «закрыть»/системная «назад» используют тот же полёт через `requestClose`.
 *
 * Математика — в `utils/heroDismissCore.ts` (покрыта тестами). Здесь только обвязка Reanimated/RNGH.
 * Корень вьювера внутри `Modal` должен быть `GestureHandlerRootView`; рисует рамку `<HeroOverlay hero={…} />`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Image as RNImage, type ViewStyle } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  DISMISS_DISTANCE,
  FALLBACK_DURATION_MS,
  HERO_DURATION_MS,
  HERO_TILE_RADIUS,
  backdropOpacity,
  containFitRect,
  dragProgress,
  dragScale,
  fallbackTarget,
  heroFrameContentFit,
  isUsableSourceRect,
  shouldDismiss,
  transformedRect,
  type HeroTransform,
  type Rect,
  type Size,
} from '../utils/heroDismissCore';

export type UseHeroDismissOptions = {
  /** Вьювер показан. */
  visible: boolean;
  /** Жест включён (выключаем при открытой подписи, обрезке, рисовании, зуме). */
  enabled?: boolean;
  /** Где сейчас миниатюра текущего фото (оконные координаты) или `null`. */
  getSourceRect: () => Promise<Rect | null>;
  /** Что рисовать в летящей рамке: uri текущего фото (для видео — кадр-превью). */
  getHeroImageUri?: () => string | null;
  /** Натуральный размер текущего фото, если известен (точнее посадка). */
  getImageSize?: () => Size | null;
  /** Окончательно закрыть вьювер (setState родителя). Вызывается после анимации. */
  onDismiss: () => void;
};

const SPRING_BACK = { damping: 24, stiffness: 280, mass: 0.9 } as const;
const OPEN_EASING = Easing.out(Easing.cubic);
const CLOSE_EASING = Easing.out(Easing.cubic);
/** Сколько ждём натуральный размер фото, если родитель его не знает. */
const IMAGE_SIZE_TIMEOUT_MS = 90;

function resolveImageSize(uri: string, timeoutMs: number): Promise<Size | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: Size | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    try {
      RNImage.getSize(
        uri,
        (width, height) => done(width > 0 && height > 0 ? { width, height } : null),
        () => done(null),
      );
    } catch {
      done(null);
    }
  });
}

export function useHeroDismiss({
  visible,
  enabled = true,
  getSourceRect,
  getHeroImageUri,
  getImageSize,
  onDismiss,
}: UseHeroDismissOptions) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  /** Прозрачность чёрного фона и панелей (0…1). */
  const backdrop = useSharedValue(0);
  /** Прозрачность контента-списка (листаемые фото). */
  const contentOpacity = useSharedValue(0);

  /** Летящая рамка: положение/размер в оконных координатах. */
  const frameOpacity = useSharedValue(0);
  const frameLeft = useSharedValue(0);
  const frameTop = useSharedValue(0);
  const frameWidth = useSharedValue(0);
  const frameHeight = useSharedValue(0);
  const frameRadius = useSharedValue(0);

  const [overlayUri, setOverlayUri] = useState<string | null>(null);
  const [overlayFit, setOverlayFit] = useState<'cover' | 'contain'>('contain');

  const sourceRectRef = useRef<Rect | null>(null);
  const imageSizeRef = useRef<Size | null>(null);
  const closingRef = useRef(false);
  const latest = useRef({ getSourceRect, getHeroImageUri, getImageSize, onDismiss });
  latest.current = { getSourceRect, getHeroImageUri, getImageSize, onDismiss };

  const getScreen = useCallback((): Size => {
    const { width, height } = Dimensions.get('window');
    return { width, height };
  }, []);

  const resetHidden = useCallback(() => {
    translateX.value = 0;
    translateY.value = 0;
    scale.value = 1;
    backdrop.value = 0;
    contentOpacity.value = 0;
    frameOpacity.value = 0;
  }, [backdrop, contentOpacity, frameOpacity, scale, translateX, translateY]);

  /** Подготовить рамку: uri, размер фото и миниатюру-цель. Вызывается заранее (при открытии и в начале жеста). */
  const prepareHero = useCallback(async () => {
    const [rect, uri] = await Promise.all([
      latest.current.getSourceRect(),
      Promise.resolve(latest.current.getHeroImageUri?.() ?? null),
    ]);
    sourceRectRef.current = rect;
    let size = latest.current.getImageSize?.() ?? null;
    if (!size && uri) size = await resolveImageSize(uri, IMAGE_SIZE_TIMEOUT_MS);
    imageSizeRef.current = size;
    setOverlayUri(uri);
    setOverlayFit(heroFrameContentFit(size));
    return { rect, uri, size };
  }, []);

  /* ─── открытие: фото вырастает из миниатюры ─── */
  useEffect(() => {
    if (!visible) {
      closingRef.current = false;
      sourceRectRef.current = null;
      imageSizeRef.current = null;
      setOverlayUri(null);
      resetHidden();
      return;
    }
    closingRef.current = false;
    let cancelled = false;
    resetHidden();

    void prepareHero().then(({ rect, uri, size }) => {
      if (cancelled) return;
      const screen = getScreen();
      const fit = containFitRect(size, screen);
      if (uri && isUsableSourceRect(rect, screen)) {
        const timing = { duration: HERO_DURATION_MS, easing: OPEN_EASING };
        // под рамкой уже стоит настоящий контент, рамка летит поверх и в конце тает
        contentOpacity.value = 1;
        frameLeft.value = rect.x;
        frameTop.value = rect.y;
        frameWidth.value = rect.width;
        frameHeight.value = rect.height;
        frameRadius.value = HERO_TILE_RADIUS;
        frameOpacity.value = 1;
        frameLeft.value = withTiming(fit.x, timing);
        frameTop.value = withTiming(fit.y, timing);
        frameWidth.value = withTiming(fit.width, timing);
        frameHeight.value = withTiming(fit.height, timing);
        frameRadius.value = withTiming(0, timing);
        frameOpacity.value = withDelay(
          HERO_DURATION_MS - 20,
          withTiming(0, { duration: 140 }),
        );
      } else {
        scale.value = 0.94;
        contentOpacity.value = withTiming(1, { duration: FALLBACK_DURATION_MS });
        scale.value = withTiming(1, { duration: FALLBACK_DURATION_MS, easing: OPEN_EASING });
      }
      backdrop.value = withTiming(1, { duration: HERO_DURATION_MS });
    });

    return () => {
      cancelled = true;
    };
  }, [
    backdrop,
    contentOpacity,
    frameHeight,
    frameLeft,
    frameOpacity,
    frameRadius,
    frameTop,
    frameWidth,
    getScreen,
    prepareHero,
    resetHidden,
    scale,
    visible,
  ]);

  const finishClose = useCallback(() => {
    latest.current.onDismiss();
  }, []);

  /** Полёт на миниатюру (или мягкий уход) и закрытие. */
  const animateOut = useCallback(
    (direction: number) => {
      if (closingRef.current) return;
      closingRef.current = true;

      const screen = getScreen();
      const rect = sourceRectRef.current;
      const current: HeroTransform = {
        translateX: translateX.value,
        translateY: translateY.value,
        scale: scale.value,
      };
      // актуальный uri важнее состояния: к моменту вызова замыкание могло устареть после пролистывания
      const uri = latest.current.getHeroImageUri?.() ?? overlayUri;

      if (uri && isUsableSourceRect(rect, screen)) {
        // подхватываем фото рамкой ровно там, где оно сейчас, и сужаем рамку до миниатюры
        const fit = containFitRect(imageSizeRef.current, screen);
        const from = transformedRect(fit, current, screen);
        const timing = { duration: HERO_DURATION_MS, easing: CLOSE_EASING };
        frameLeft.value = from.x;
        frameTop.value = from.y;
        frameWidth.value = from.width;
        frameHeight.value = from.height;
        frameRadius.value = 0;
        frameOpacity.value = 1;
        contentOpacity.value = 0;

        frameLeft.value = withTiming(rect.x, timing);
        frameTop.value = withTiming(rect.y, timing);
        frameWidth.value = withTiming(rect.width, timing);
        frameHeight.value = withTiming(rect.height, timing);
        frameRadius.value = withTiming(HERO_TILE_RADIUS, timing);
        backdrop.value = withTiming(0, timing, (finished) => {
          'worklet';
          if (finished) runOnJS(finishClose)();
        });
        // в самом конце рамка растворяется в настоящей миниатюре
        frameOpacity.value = withDelay(
          HERO_DURATION_MS * 0.85,
          withTiming(0, { duration: HERO_DURATION_MS * 0.15 }),
        );
        return;
      }

      const target = fallbackTarget(current, direction, screen);
      const timing = { duration: FALLBACK_DURATION_MS, easing: CLOSE_EASING };
      translateY.value = withTiming(target.translateY, timing);
      scale.value = withTiming(target.scale, timing);
      backdrop.value = withTiming(0, timing);
      contentOpacity.value = withTiming(0, timing, (finished) => {
        'worklet';
        if (finished) runOnJS(finishClose)();
      });
    },
    [
      backdrop,
      contentOpacity,
      finishClose,
      frameHeight,
      frameLeft,
      frameOpacity,
      frameRadius,
      frameTop,
      frameWidth,
      getScreen,
      overlayUri,
      scale,
      translateX,
      translateY,
    ],
  );

  /** Закрыть с анимацией (кнопка «закрыть», кнопка «назад»). */
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    void prepareHero().then(() => animateOut(1));
  }, [animateOut, prepareHero]);

  const prefetchHero = useCallback(() => {
    void prepareHero();
  }, [prepareHero]);

  const springBack = useCallback(
    (velocityY: number) => {
      if (closingRef.current) return;
      translateX.value = withSpring(0, SPRING_BACK);
      translateY.value = withSpring(0, { ...SPRING_BACK, velocity: velocityY });
      scale.value = withSpring(1, SPRING_BACK);
      backdrop.value = withTiming(1, { duration: 160 });
    },
    [backdrop, scale, translateX, translateY],
  );

  const gesture = useMemo(() => {
    // Dimensions недоступен на UI-потоке — берём высоту заранее
    const screenHeight = Dimensions.get('window').height;
    return (
      Gesture.Pan()
        .enabled(enabled)
        // закрытие — одним пальцем (два пальца — щипок-зум во вьювере)
        .maxPointers(1)
        // вертикаль активирует закрытие, горизонталь отдаём пролистыванию фото
        .activeOffsetY([-10, 10])
        .failOffsetX([-16, 16])
        .onStart(() => {
          runOnJS(prefetchHero)();
        })
        .onUpdate((e) => {
          const progress = dragProgress(e.translationY, screenHeight);
          translateX.value = e.translationX;
          translateY.value = e.translationY;
          scale.value = dragScale(progress);
          backdrop.value = backdropOpacity(progress);
        })
        .onEnd((e) => {
          if (shouldDismiss(e.translationY, e.velocityY)) {
            runOnJS(animateOut)(e.translationY || e.velocityY);
          } else {
            runOnJS(springBack)(e.velocityY);
          }
        })
        .onFinalize((_e, success) => {
          if (!success) runOnJS(springBack)(0);
        })
    );
  }, [animateOut, backdrop, enabled, prefetchHero, scale, springBack, translateX, translateY]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ] as ViewStyle['transform'],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  /** Верхняя/нижняя панели: тают вместе с фоном. */
  const chromeStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  /** Рамка летящего фото. */
  const frameStyle = useAnimatedStyle(() => ({
    opacity: frameOpacity.value,
    left: frameLeft.value,
    top: frameTop.value,
    width: frameWidth.value,
    height: frameHeight.value,
    borderRadius: frameRadius.value,
  }));

  return {
    gesture,
    contentStyle,
    backdropStyle,
    chromeStyle,
    frameStyle,
    /** uri и режим вписывания для `<HeroOverlay>`. */
    overlayUri,
    overlayFit,
    requestClose,
    /** Порог, чтобы UI мог подсветить «потянули достаточно» при необходимости. */
    dismissDistance: DISMISS_DISTANCE,
  };
}

export type HeroDismiss = ReturnType<typeof useHeroDismiss>;
