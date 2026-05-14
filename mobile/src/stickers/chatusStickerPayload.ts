import {
  getCompositeStickerRefs,
  getCompositeTextBody,
  tryParseCompositeMessage,
} from './chatusCompositePayload';

export type ChatusStickerRef = {
  packId: string;
  stickerId: string;
};

export function encodeStickerPayload(ref: ChatusStickerRef): string {
  return JSON.stringify({ t: 'cs', p: ref.packId, i: ref.stickerId });
}

export function tryDecodeStickerPayload(content: string | null | undefined): ChatusStickerRef | null {
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

/**
 * Оптимистичное сообщение: пометить «solo»-отправку стикера для UI (вход Reanimated),
 * только если запрошено и контент — валидный стикер JSON (не даём включить флаг для обычного текста).
 */
export function resolveChatusStickerSoloSendFlag(
  text: string,
  sendOptions?: { chatusStickerSoloSend?: boolean },
): boolean {
  if (sendOptions?.chatusStickerSoloSend !== true) return false;
  if (isChatusStickerMessage(text)) return true;
  const parsed = tryParseCompositeMessage(text);
  if (!parsed) return false;
  if (getCompositeTextBody(parsed).trim().length > 0) return false;
  return getCompositeStickerRefs(parsed).length > 0;
}
