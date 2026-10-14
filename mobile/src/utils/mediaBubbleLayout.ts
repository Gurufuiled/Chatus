/**
 * Размеры и раскладка пузырей фото / видео / голосовых «как в Telegram». Чистая логика без RN — покрыта тестами в
 * `mediaBubbleLayout.test.ts`; общая для обычных чатов и Telegram-аккаунта.
 *
 * Что было не так:
 *  - вытянутое по вертикали видео получалось уже, чем в Telegram (ширина ужималась под предельную высоту), и подпись
 *    вместе со временем не помещалась в одну строку: текст уезжал вниз, пузырь рос;
 *  - у фото без подписи реакция рисовалась внутри цветной рамки пузыря, дорисовывая под фото цветную полосу;
 *  - пузырь голосового всегда был максимальной ширины, независимо от длительности.
 */

/** Минимальная ширина медиа-пузыря относительно максимальной: Telegram не делает вытянутые видео «узкими». */
export const MIN_MEDIA_WIDTH_RATIO = 0.9;
/** Отношение высоты к ширине, с которого картинка считается «вытянутой» (портрет). */
export const PORTRAIT_ASPECT = 1.28;

export type MediaSize = { width: number; height: number };

/**
 * Размер медиа в пузыре. Масштабируем под предельные ширину/высоту; вытянутое по вертикали расширяем до
 * `minWidthRatio` от максимальной ширины и обрезаем по высоте (картинка рисуется как `cover`) — так видео в подписи
 * получает достаточно ширины для текста и времени, как у Telegram.
 */
export function computeMediaDisplaySize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number,
  maxHeight: number,
  fallback: MediaSize,
  minWidthRatio: number = MIN_MEDIA_WIDTH_RATIO,
): MediaSize {
  if (!(naturalWidth > 0) || !(naturalHeight > 0)) {
    return {
      width: Math.min(maxWidth, fallback.width),
      height: Math.min(maxHeight, fallback.height),
    };
  }

  const baseScale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
  let width = Math.round(naturalWidth * baseScale);
  let height = Math.round(naturalHeight * baseScale);

  const minWidth = Math.round(maxWidth * minWidthRatio);
  const isPortrait = naturalHeight / naturalWidth > PORTRAIT_ASPECT;
  if (isPortrait && width < minWidth) {
    width = minWidth;
    height = Math.min(maxHeight, Math.round(naturalHeight * (minWidth / naturalWidth)));
  }

  return { width, height };
}

/**
 * Реакции у фото/видео без подписи рисуются отдельной «таблеткой» под пузырём, а не внутри цветной рамки.
 * С подписью, подвалом (канал), во вложенном виде (ответ) и в постах каналов остаются внутри, как раньше.
 */
export function shouldFloatMediaReactions(params: {
  hasReactions: boolean;
  hasCaption: boolean;
  hasFooter: boolean;
  embedded: boolean;
  incomingChannelPost: boolean;
}): boolean {
  return (
    params.hasReactions &&
    !params.hasCaption &&
    !params.hasFooter &&
    !params.embedded &&
    !params.incomingChannelPost
  );
}

const VOICE_MIN_WIDTH_RATIO = 0.43;
const VOICE_MIN_WIDTH_FLOOR = 170;
const VOICE_MAX_WIDTH_RATIO = 0.72;
const VOICE_MAX_WIDTH_CAP = 290;
/** Длительность, при которой пузырь достигает максимальной ширины. */
const VOICE_FULL_WIDTH_SECONDS = 40;

/**
 * Ширина пузыря голосового: короткое — узкое, длинное — до предела (как в Telegram). Раньше пузырь всегда занимал
 * максимум, и у 9-секундного голосового была лишняя пустая дорожка.
 */
export function voiceBubbleWidth(durationMs: number, screenWidth: number): number {
  const maxWidth = Math.min(screenWidth * VOICE_MAX_WIDTH_RATIO, VOICE_MAX_WIDTH_CAP);
  const minWidth = Math.min(maxWidth, Math.max(VOICE_MIN_WIDTH_FLOOR, screenWidth * VOICE_MIN_WIDTH_RATIO));
  const seconds = Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 1000 : 0;
  const t = Math.min(seconds / VOICE_FULL_WIDTH_SECONDS, 1);
  return Math.round(minWidth + (maxWidth - minWidth) * t);
}
