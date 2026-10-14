/**
 * Квадратный видеокружок для Telegram.
 *
 * Камера пишет 4:3 / 16:9, а круг в приложении — лишь маска при показе. Telegram принимает как кружок только
 * квадратное видео: прямоугольный файл он отдаёт обычным роликом (так и было: «кружок приходит видеороликом»).
 * Перед отправкой в Telegram файл обрезается по центру до квадрата нативным модулем `VideoSquare`
 * (Media3 Transformer, см. `tdlib-android/com/anonymous/mobile/VideoSquareModule.kt`).
 *
 * В обычных чатах Chatus файл не трогаем: там круг — маска, и исходное видео отправляется как есть.
 */
import { NativeModules, Platform } from 'react-native';
import { getThumbnailAsync } from 'expo-video-thumbnails';
import type { VideoNoteRecordingResult } from './VideoNoteRecorderService';

/** Сторона квадрата, px. 384 — как у официальных кружков Telegram: влезает в лимиты и быстро кодируется. */
export const VIDEO_NOTE_SQUARE_SIDE_PX = 384;

type VideoSquareNative = {
  cropToSquare: (inputUri: string, side: number) => Promise<{ uri: string; width: number; height: number }>;
};

function getNative(): VideoSquareNative | null {
  const mod = NativeModules.VideoSquare as VideoSquareNative | undefined;
  return typeof mod?.cropToSquare === 'function' ? mod : null;
}

/** Есть ли в этой сборке нативная обрезка (старые сборки без неё отправляют файл как есть). */
export function isSquareVideoNoteSupported(): boolean {
  return Platform.OS === 'android' && getNative() != null;
}

export type SquareVideoNoteOutcome = {
  result: VideoNoteRecordingResult;
  /** `true` — файл обрезан до квадрата; `false` — отправится исходный (нет модуля или обрезка не удалась). */
  squared: boolean;
  /** Причина, если обрезать не вышло (для лога). */
  error?: string;
};

/**
 * Возвращает запись, готовую к отправке кружком в Telegram. Никогда не бросает: при любой проблеме отдаёт
 * исходную запись (кружок уйдёт, возможно, как обычное видео — это лучше, чем потерять сообщение).
 */
export async function ensureSquareVideoNote(
  recording: VideoNoteRecordingResult,
  side: number = VIDEO_NOTE_SQUARE_SIDE_PX,
): Promise<SquareVideoNoteOutcome> {
  if (Platform.OS !== 'android') {
    return { result: recording, squared: false };
  }
  const native = getNative();
  if (!native) {
    return { result: recording, squared: false, error: 'Нативный модуль VideoSquare не найден в этой сборке' };
  }

  try {
    const cropped = await native.cropToSquare(recording.uri, side);
    if (!cropped?.uri) {
      return { result: recording, squared: false, error: 'Обрезка не вернула файл' };
    }
    // превью берём из квадратного файла: исходное было прямоугольным
    let thumbnailUri = recording.thumbnailUri;
    try {
      const thumb = await getThumbnailAsync(cropped.uri, { time: 0 });
      if (thumb?.uri) thumbnailUri = thumb.uri;
    } catch {
      /* останется превью исходного видео */
    }
    return {
      result: { ...recording, uri: cropped.uri, thumbnailUri },
      squared: true,
    };
  } catch (error) {
    return {
      result: recording,
      squared: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
