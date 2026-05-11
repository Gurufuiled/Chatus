/**
 * Media hashing helpers for LineSync BlobRef.
 *
 * MVP event-log uses server-returned sha256 after upload. This helper is the local path for
 * later peer-first media, where the device must know the content hash before upload/fallback.
 */

import * as FileSystem from 'expo-file-system/legacy';

export function normalizeSha256(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function calculateFileSha256(uri: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return null;
  }

  const content = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(content);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const digest = await subtle.digest('SHA-256', buffer);
  return bytesToHex(new Uint8Array(digest));
}
