import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

/**
 * iOS Photos local id из URI вида ph://&lt;localIdentifier&gt; (RCTImageLoader не умеет ph://).
 */
export function parsePhAssetLocalIdentifier(uri: string): string | null {
  const t = uri.trim();
  if (!/^ph:\/\//i.test(t)) return null;
  const rest = t.replace(/^ph:\/\//i, '').split('?')[0];
  return rest.length > 0 ? rest : null;
}

export function isIosPhAssetUri(uri: string): boolean {
  return Platform.OS === 'ios' && /^ph:\/\//i.test(uri.trim());
}

/**
 * Возвращает file:// URI, пригодный для &lt;Image source&gt;, или null при ошибке.
 */
export async function resolveIosPhotoLibraryUri(uri: string): Promise<string | null> {
  if (!isIosPhAssetUri(uri)) return uri.trim();

  const localId = parsePhAssetLocalIdentifier(uri);
  if (!localId) return null;

  try {
    const perm = await MediaLibrary.getPermissionsAsync();
    if (!perm.granted) {
      const req = await MediaLibrary.requestPermissionsAsync();
      if (!req.granted) return null;
    }

    const info = await MediaLibrary.getAssetInfoAsync(localId, {
      shouldDownloadFromNetwork: true,
    });

    const fileLike = info.localUri?.trim() || info.uri?.trim();
    if (fileLike && /^file:\/\//i.test(fileLike)) return fileLike;
    if (fileLike && !/^ph:\/\//i.test(fileLike)) return fileLike;
    return null;
  } catch {
    return null;
  }
}

/**
 * Для ph:// ждём file:// из MediaLibrary; иначе сразу возвращаем uri.
 * Пока iOS ph в процессе резолва — null (показать лоадер, не кормить RCTImageLoader).
 */
export function useIosResolvableMediaLibraryUri(uri: string): string | null {
  const trimmed = uri.trim();
  const [resolved, setResolved] = useState<string | null>(() =>
    isIosPhAssetUri(trimmed) ? null : trimmed
  );

  useEffect(() => {
    const t = uri.trim();
    if (!isIosPhAssetUri(t)) {
      setResolved(t);
      return;
    }

    let cancelled = false;
    setResolved(null);

    void resolveIosPhotoLibraryUri(t).then((out) => {
      if (cancelled) return;
      setResolved(out && !/^ph:\/\//i.test(out) ? out : null);
    });

    return () => {
      cancelled = true;
    };
  }, [uri]);

  return resolved;
}
