import { NativeModules } from 'react-native';

import { ensureLocalFileUri } from './ensureLocalFileUri';
import {
  isSquareVideoDimensions,
  probeLocalVideoDimensionsWithRetry,
  type LocalVideoDimensions,
} from './probeLocalVideoDimensions';

const MAX_SIDE_PX = 640;
const MIN_SIDE_PX = 240;
const MAX_DURATION_MS = 60_000;
/** Native center-crop can hang on some iOS assets; fail clearly instead of freezing send UX. */
const NATIVE_CROP_TIMEOUT_MS = 45_000;

type TdlibVideoCropNative = {
  centerCropSquareVideo?: (path: string, maxSide: number) => Promise<string>;
};

function fileUriToAbsolutePath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

function absolutePathToFileUri(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('file://')) return trimmed;
  return `file://${trimmed}`;
}

function lengthPxFromDims(dims: LocalVideoDimensions): number {
  return Math.min(MAX_SIDE_PX, Math.max(MIN_SIDE_PX, Math.round(Math.min(dims.width, dims.height))));
}

async function centerCropViaNative(uri: string): Promise<string> {
  const mod = NativeModules.Tdlib as TdlibVideoCropNative | undefined;
  if (typeof mod?.centerCropSquareVideo !== 'function') {
    throw new Error(
      'Запись не квадратная — Telegram принимает только кружки. Запишите ещё раз через свайп вверх по микрофону.',
    );
  }
  const cropPromise = mod.centerCropSquareVideo(fileUriToAbsolutePath(uri), MAX_SIDE_PX);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let outPath: string;
  try {
    outPath = await Promise.race([
      cropPromise.finally(() => {
        if (timer) clearTimeout(timer);
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              'Не удалось обрезать видеокружок (таймаут). Запишите ещё раз через свайп вверх по микрофону.',
            ),
          );
        }, NATIVE_CROP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (typeof outPath !== 'string' || !outPath.trim()) {
    throw new Error(
      'Не удалось сделать квадратное видео. Запишите кружок ещё раз через свайп вверх по микрофону.',
    );
  }
  return absolutePathToFileUri(outPath);
}

/**
 * Ensures a local video-note file is square H.264-ready for TDLib `inputMessageVideoNote`.
 * Already-square Android recordings pass through; non-square (typical iOS) are center-cropped.
 */
export async function ensureSquareVideoNoteFile(
  uri: string,
  durationMs: number,
): Promise<{ uri: string; lengthPx: number; dims: LocalVideoDimensions }> {
  if (durationMs > MAX_DURATION_MS) {
    throw new Error('Видеосообщение длиннее 60 секунд. Запишите короче.');
  }

  let localUri = await ensureLocalFileUri(uri, 'video_note.mp4');
  let dims = await probeLocalVideoDimensionsWithRetry(localUri);
  if (!dims) {
    throw new Error(
      'Не удалось определить размер видео. Запишите ещё раз через свайп вверх по микрофону.',
    );
  }

  const needsCrop = !isSquareVideoDimensions(dims);

  if (needsCrop) {
    localUri = await centerCropViaNative(localUri);
    dims = await probeLocalVideoDimensionsWithRetry(localUri);
    if (!dims || !isSquareVideoDimensions(dims)) {
      throw new Error(
        'Запись не квадратная — Telegram принимает только кружки. Запишите ещё раз через свайп вверх по микрофону.',
      );
    }
  }

  return {
    uri: localUri,
    lengthPx: lengthPxFromDims(dims),
    dims,
  };
}
