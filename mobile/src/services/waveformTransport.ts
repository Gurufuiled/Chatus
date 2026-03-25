function decodeBase64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizeLegacyWaveform(bytes: Uint8Array): number[] {
  return Array.from(bytes)
    .map((value) => (value <= 1 ? value : value / 255))
    .filter((value) => Number.isFinite(value));
}

export function decodeServerWaveform(value: string | null | undefined): number[] {
  if (!value) return [];

  try {
    const bytes = decodeBase64Bytes(value);
    if (bytes.length === 0) return [];

    try {
      const json = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(json) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is number => typeof item === 'number' && Number.isFinite(item),
        );
      }
    } catch {
      // Fallback to old raw-byte representation that may still exist in older rows.
    }

    return normalizeLegacyWaveform(bytes);
  } catch {
    return [];
  }
}
