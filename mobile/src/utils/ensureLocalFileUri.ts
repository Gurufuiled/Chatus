import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { isIosPhAssetUri, resolveIosPhotoLibraryUri } from './resolveIosPhotoLibraryUri';

/** iOS Photos often appends a plist fragment (`#...`) that breaks upload and hashing. */
export function stripUriFragment(uri: string): string {
  const trimmed = uri.trim();
  const hashIndex = trimmed.indexOf('#');
  return hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
}

function inferExtension(fileName: string | undefined, fallback: string): string {
  const candidate = fileName?.trim();
  if (candidate && candidate.includes('.')) {
    const ext = candidate.split('.').pop()?.trim().toLowerCase();
    if (ext) return ext;
  }
  return fallback;
}

function isCacheOrDocumentUri(uri: string): boolean {
  const cacheDir = FileSystem.cacheDirectory ?? '';
  const docDir = FileSystem.documentDirectory ?? '';
  return (
    (cacheDir.length > 0 && uri.startsWith(cacheDir)) ||
    (docDir.length > 0 && uri.startsWith(docDir))
  );
}

/**
 * Returns a local file:// URI that native upload and FileSystem readers can use reliably.
 * Copies transient / gallery / assets-library URIs into app cache when needed.
 */
export async function ensureLocalFileUri(
  uri: string,
  fallbackName = 'media.bin',
): Promise<string> {
  let normalized = stripUriFragment(uri);
  if (!normalized) {
    throw new Error('Empty media URI');
  }

  if (isIosPhAssetUri(normalized)) {
    const resolved = await resolveIosPhotoLibraryUri(normalized);
    if (!resolved) {
      throw new Error('Could not resolve iOS photo library asset');
    }
    normalized = stripUriFragment(resolved);
  }

  if (
    normalized.startsWith('file://') ||
    normalized.startsWith('content://') ||
    (Platform.OS !== 'ios' && normalized.startsWith('/'))
  ) {
    const info = await FileSystem.getInfoAsync(normalized).catch(() => null);
    if (info?.exists && !info.isDirectory) {
      if (Platform.OS === 'ios' && isCacheOrDocumentUri(normalized)) {
        return normalized;
      }
      if (Platform.OS !== 'ios') {
        return normalized;
      }
      // iOS gallery file:// paths can still fail in multipart upload — copy to cache.
    }
  }

  const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!cacheDir) {
    throw new Error('No writable cache directory for media upload');
  }

  const ext = inferExtension(fallbackName, 'bin');
  const dest = `${cacheDir}${cacheDir.endsWith('/') ? '' : '/'}upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  await FileSystem.copyAsync({ from: normalized, to: dest });
  return dest;
}
