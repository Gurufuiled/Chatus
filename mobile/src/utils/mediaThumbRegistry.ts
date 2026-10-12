/**
 * Реестр миниатюр: вьювер фото по id медиа узнаёт, где сейчас на экране лежит
 * миниатюра, чтобы «приземлить» на неё фото при закрытии свайпом.
 * Без импортов react-native — тестируется в `mediaThumbRegistry.test.ts`.
 */

import type { Rect } from './heroDismissCore';

/** Подмножество RN `View`/ref, нужное для измерения. */
export type MeasurableThumb = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

/** Сколько ждём ответа измерения, прежде чем сдаться и закрыть фото без «посадки». */
export const MEASURE_TIMEOUT_MS = 120;

const thumbs = new Map<string, MeasurableThumb>();

/** Регистрирует миниатюру; `null` — снять регистрацию (размонтирование). */
export function registerMediaThumb(id: string, ref: MeasurableThumb | null): void {
  if (!id) return;
  if (ref) {
    thumbs.set(id, ref);
  } else {
    thumbs.delete(id);
  }
}

/** Снимает регистрацию только если под этим id всё ещё лежит именно этот ref. */
export function unregisterMediaThumb(id: string, ref: MeasurableThumb): void {
  if (thumbs.get(id) === ref) thumbs.delete(id);
}

export function measureThumbRef(
  ref: MeasurableThumb | null | undefined,
  timeoutMs: number = MEASURE_TIMEOUT_MS,
): Promise<Rect | null> {
  if (!ref) return Promise.resolve(null);
  return new Promise<Rect | null>((resolve) => {
    let settled = false;
    const done = (value: Rect | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    try {
      ref.measureInWindow((x, y, width, height) => {
        if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
          done(null);
          return;
        }
        done({ x, y, width, height });
      });
    } catch {
      done(null);
    }
  });
}

export function measureMediaThumb(
  id: string | null | undefined,
  timeoutMs?: number,
): Promise<Rect | null> {
  if (!id) return Promise.resolve(null);
  return measureThumbRef(thumbs.get(id), timeoutMs);
}

/** Только для тестов. */
export function __resetMediaThumbRegistryForTests(): void {
  thumbs.clear();
}
