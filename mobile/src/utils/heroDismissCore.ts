/**
 * Чистая математика «закрытие фото свайпом как в Telegram»: фото следует за пальцем,
 * уменьшается, фон светлеет, а при отпускании фото возвращается на место миниатюры.
 * Без импортов react-native — тестируется в `heroDismissCore.test.ts`.
 * Функции, которые вызываются из жеста на UI-потоке, помечены `'worklet'`.
 *
 * Система координат: оконные (как `measureInWindow`). Контент вьювера — вью на весь экран,
 * трансформируется вокруг своего центра: p' = c + scale * (p - c) + t.
 */

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };
export type HeroTransform = { translateX: number; translateY: number; scale: number };

/** Сдвиг по вертикали (px), после которого отпускание закрывает фото. */
export const DISMISS_DISTANCE = 90;
/** Скорость броска (px/s), при которой закрываем независимо от расстояния. */
export const DISMISS_VELOCITY = 800;
/** Минимальный масштаб фото во время перетаскивания. */
export const MIN_DRAG_SCALE = 0.62;
/** Длительность полёта фото на место миниатюры, мс. */
export const HERO_DURATION_MS = 280;
/** Длительность появления/исчезновения без миниатюры-цели, мс. */
export const FALLBACK_DURATION_MS = 200;
/** Скругление рамки фото, когда оно «садится» на миниатюру. */
export const HERO_TILE_RADIUS = 8;

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/**
 * Прямоугольник, который реально занимает изображение при `contentFit="contain"`
 * в контейнере. Если размер неизвестен — считаем, что оно занимает весь контейнер.
 */
export function containFitRect(content: Size | null | undefined, container: Size): Rect {
  if (!content || !(content.width > 0) || !(content.height > 0)) {
    return { x: 0, y: 0, width: container.width, height: container.height };
  }
  const scale = Math.min(container.width / content.width, container.height / content.height);
  const width = content.width * scale;
  const height = content.height * scale;
  return {
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
    width,
    height,
  };
}

/** Доля «оттянутости» 0…1: через ~45% высоты экрана фон полностью прозрачен. */
export function dragProgress(dy: number, screenHeight: number): number {
  'worklet';
  if (!(screenHeight > 0)) return 0;
  return clamp(Math.abs(dy) / (screenHeight * 0.45), 0, 1);
}

export function dragScale(progress: number): number {
  'worklet';
  return 1 - (1 - MIN_DRAG_SCALE) * clamp(progress, 0, 1);
}

export function backdropOpacity(progress: number): number {
  'worklet';
  return clamp(1 - clamp(progress, 0, 1) * 1.15, 0, 1);
}

/** Закрывать ли при отпускании: расстояние ИЛИ бросок, но бросок «обратно» отменяет закрытие. */
export function shouldDismiss(dy: number, vy: number): boolean {
  'worklet';
  const fast = Math.abs(vy) >= DISMISS_VELOCITY;
  if (fast && dy !== 0 && Math.sign(vy) !== Math.sign(dy)) return false;
  if (fast) return true;
  return Math.abs(dy) >= DISMISS_DISTANCE;
}

/**
 * Трансформация, при которой вписанное фото (`fit`) ложится на миниатюру (`source`).
 * Миниатюры обычно обрезаны по `cover`, поэтому масштаб берём по большей стороне.
 */
export function heroTarget(source: Rect, fit: Rect, screen: Size): HeroTransform {
  const sx = fit.width > 0 ? source.width / fit.width : 1;
  const sy = fit.height > 0 ? source.height / fit.height : 1;
  const scale = Math.max(sx, sy);
  const cx = screen.width / 2;
  const cy = screen.height / 2;
  const fitCx = fit.x + fit.width / 2;
  const fitCy = fit.y + fit.height / 2;
  const srcCx = source.x + source.width / 2;
  const srcCy = source.y + source.height / 2;
  return {
    scale,
    translateX: srcCx - cx - scale * (fitCx - cx),
    translateY: srcCy - cy - scale * (fitCy - cy),
  };
}

/** Применить трансформацию к точке (для проверок и тестов). */
export function applyTransform(
  point: { x: number; y: number },
  t: HeroTransform,
  screen: Size,
): { x: number; y: number } {
  const cx = screen.width / 2;
  const cy = screen.height / 2;
  return {
    x: cx + t.scale * (point.x - cx) + t.translateX,
    y: cy + t.scale * (point.y - cy) + t.translateY,
  };
}

/** Пригодна ли миниатюра как цель: ненулевая и хотя бы частично видна в окне. */
export function isUsableSourceRect(rect: Rect | null | undefined, screen: Size): rect is Rect {
  if (!rect) return false;
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return false;
  if (rect.width <= 0 || rect.height <= 0) return false;
  const overlapX = Math.min(rect.x + rect.width, screen.width) - Math.max(rect.x, 0);
  const overlapY = Math.min(rect.y + rect.height, screen.height) - Math.max(rect.y, 0);
  return overlapX > rect.width * 0.25 && overlapY > rect.height * 0.25;
}

/** Цель, когда миниатюры нет: фото уезжает дальше по направлению жеста и уменьшается. */
export function fallbackTarget(
  current: HeroTransform,
  direction: number,
  screen: Size,
): HeroTransform {
  const sign = direction < 0 ? -1 : 1;
  return {
    translateX: current.translateX,
    translateY: current.translateY + sign * screen.height * 0.18,
    scale: Math.min(current.scale, 0.7) * 0.9,
  };
}

/**
 * Где на экране окажется прямоугольник `rect` (вписанное фото) после трансформации контента.
 * Нужен, чтобы при отпускании пальца «подхватить» фото в его текущем положении рамкой.
 */
export function transformedRect(rect: Rect, t: HeroTransform, screen: Size): Rect {
  const topLeft = applyTransform({ x: rect.x, y: rect.y }, t, screen);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: rect.width * t.scale,
    height: rect.height * t.scale,
  };
}

/**
 * Как рисовать фото в летящей рамке. Когда размер фото известен, вписанная рамка совпадает с ним по
 * пропорциям, и `cover` выглядит точно как `contain`, но потом, сужаясь до миниатюры, обрезает
 * фото по краям (как сама миниатюра) и не вылезает за её границы. Размер неизвестен — `contain`.
 */
export function heroFrameContentFit(size: Size | null | undefined): 'cover' | 'contain' {
  return size && size.width > 0 && size.height > 0 ? 'cover' : 'contain';
}
