/**
 * Persists last attachment-sheet gallery snapshot so cold start can paint thumbnails
 * before MediaLibrary.getAssetsAsync + getAssetInfoAsync finish.
 */

import * as FileSystem from 'expo-file-system/legacy';
import type { GalleryItem } from '../components/InputAttachmentSheet';

const CACHE_FILENAME = 'attachment_gallery_cache_v1.json';
/** Drop disk snapshot if older than this (items may have changed a lot). */
const MAX_DISK_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type CachedPayload = {
  savedAt: number;
  items: GalleryItem[];
};

function cacheUri(): string | null {
  const base = FileSystem.cacheDirectory;
  return base ? `${base}${CACHE_FILENAME}` : null;
}

export async function readAttachmentGalleryDiskCache(): Promise<GalleryItem[] | null> {
  const uri = cacheUri();
  if (!uri) return null;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(uri);
    const data = JSON.parse(raw) as CachedPayload;
    if (!data?.items || !Array.isArray(data.items) || data.items.length === 0) return null;
    if (typeof data.savedAt !== 'number' || Date.now() - data.savedAt > MAX_DISK_AGE_MS) {
      return null;
    }
    return data.items;
  } catch {
    return null;
  }
}

export async function writeAttachmentGalleryDiskCache(items: GalleryItem[]): Promise<void> {
  const uri = cacheUri();
  if (!uri || items.length === 0) return;
  try {
    const payload: CachedPayload = {
      savedAt: Date.now(),
      items,
    };
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export async function clearAttachmentGalleryDiskCache(): Promise<void> {
  const uri = cacheUri();
  if (!uri) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    /* ignore */
  }
}
