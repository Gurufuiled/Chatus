import type { ChatusStickerRef } from '@/utils/stickerPayload';

const stickerModules = import.meta.glob<string>(
  '../../../mobile/assets/stickers/friend/*.webp',
  { query: '?url', import: 'default', eager: true },
);

function stemFromGlobPath(path: string): string {
  const match = path.match(/\/([^/]+)\.webp$/);
  return match?.[1] ?? path;
}

const LEGACY_IDS = new Set([
  'wave',
  'hi',
  'heart',
  'laugh',
  'coffee',
  'moon',
  'star',
  'gift',
  'cat',
  'plane',
  'donut',
  'plant',
]);

export const STICKER_URL_BY_ID: Record<string, string> = {};
for (const [path, url] of Object.entries(stickerModules)) {
  const id = stemFromGlobPath(path);
  if (!LEGACY_IDS.has(id)) {
    STICKER_URL_BY_ID[id] = url;
  }
}

export const FRIEND_STICKER_ITEMS: ChatusStickerRef[] = Object.keys(STICKER_URL_BY_ID)
  .sort((a, b) => a.localeCompare(b, 'en'))
  .map((stickerId) => ({ packId: 'friend', stickerId }));

export function getStickerImageUrl(ref: ChatusStickerRef): string | null {
  if (ref.packId !== 'friend') return null;
  return STICKER_URL_BY_ID[ref.stickerId] ?? null;
}
