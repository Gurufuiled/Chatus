/** Decode waveform from API base64 (UTF-8 JSON number[]). */
export function decodeWaveformBase64(encoded: string | null | undefined): number[] {
  if (!encoded) return [];
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  } catch {
    return [];
  }
}

export function buildDecorativeWaveform(seed: string, barCount: number): number[] {
  let hash = 1;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return Array.from({ length: barCount }, (_, index) => {
    const t = barCount <= 1 ? 0 : index / (barCount - 1);
    const x = Math.sin(hash * 0.00013 + index * 12.9898) * 43758.5453;
    const noise = x - Math.floor(x);
    const envelope = 0.28 + Math.sin(t * Math.PI) * 0.34;
    return Math.max(0.08, Math.min(1, envelope + (noise - 0.5) * 0.25));
  });
}
