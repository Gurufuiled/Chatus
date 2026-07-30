import { getThumbnailAsync } from 'expo-video-thumbnails';

const GENERATED_THUMBNAIL_TIME_MS = 0;
const MAX_CONCURRENT_THUMBNAILS = 2;
const thumbnailCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string>>();
const thumbnailQueue: Array<() => void> = [];
let activeThumbnailRequests = 0;

function runNextThumbnailRequest(): void {
  while (
    activeThumbnailRequests < MAX_CONCURRENT_THUMBNAILS &&
    thumbnailQueue.length > 0
  ) {
    const start = thumbnailQueue.shift();
    if (!start) return;
    activeThumbnailRequests += 1;
    start();
  }
}

function enqueueThumbnailRequest<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    thumbnailQueue.push(() => {
      task()
        .then(resolve, reject)
        .finally(() => {
          activeThumbnailRequests = Math.max(0, activeThumbnailRequests - 1);
          runNextThumbnailRequest();
        });
    });
    runNextThumbnailRequest();
  });
}

export function getCachedVideoThumbnailUri(videoUri: string): string | null {
  const normalizedUri = videoUri.trim();
  if (!normalizedUri) return null;
  return thumbnailCache.get(normalizedUri) ?? null;
}

export async function ensureVideoThumbnailUri(videoUri: string): Promise<string> {
  const normalizedUri = videoUri.trim();
  if (!normalizedUri) return '';

  const cached = thumbnailCache.get(normalizedUri);
  if (cached) return cached;

  const existingRequest = inFlightRequests.get(normalizedUri);
  if (existingRequest) {
    return existingRequest;
  }

  const request = enqueueThumbnailRequest(() =>
    getThumbnailAsync(normalizedUri, {
      time: GENERATED_THUMBNAIL_TIME_MS,
    }),
  )
    .then((result) => {
      const nextUri = result?.uri?.trim() ?? '';
      if (nextUri) {
        thumbnailCache.set(normalizedUri, nextUri);
      }
      return nextUri;
    })
    .finally(() => {
      inFlightRequests.delete(normalizedUri);
    });

  inFlightRequests.set(normalizedUri, request);
  return request;
}
