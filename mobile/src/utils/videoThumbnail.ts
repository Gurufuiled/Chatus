import { getThumbnailAsync } from 'expo-video-thumbnails';

const GENERATED_THUMBNAIL_TIME_MS = 0;
const thumbnailCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string>>();

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

  const request = getThumbnailAsync(normalizedUri, {
    time: GENERATED_THUMBNAIL_TIME_MS,
  })
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
