export type ChatusStickerRef = {
  packId: string;
  stickerId: string;
};

export function encodeStickerPayload(ref: ChatusStickerRef): string {
  return JSON.stringify({ t: 'cs', p: ref.packId, i: ref.stickerId });
}

export function tryDecodeStickerPayload(
  content: string | null | undefined,
): ChatusStickerRef | null {
  const raw = content?.trim();
  if (!raw || raw[0] !== '{') return null;
  try {
    const o = JSON.parse(raw) as { t?: string; p?: unknown; i?: unknown };
    if (o?.t === 'cs' && typeof o.p === 'string' && typeof o.i === 'string') {
      return { packId: o.p, stickerId: o.i };
    }
  } catch {
    return null;
  }
  return null;
}

export function isChatusStickerMessage(content: string | null | undefined): boolean {
  return !!tryDecodeStickerPayload(content);
}
