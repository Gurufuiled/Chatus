import type { ChatusStickerRef } from './chatusStickerPayload';

export const MAX_RECENT_STICKERS = 24;

function sameRef(a: ChatusStickerRef, b: ChatusStickerRef): boolean {
  return a.packId === b.packId && a.stickerId === b.stickerId;
}

/** MRU: новый выбор в начало, без дублей, обрезка. */
export function mergeMruStickerRefs(
  prev: ChatusStickerRef[],
  pick: ChatusStickerRef,
  max: number = MAX_RECENT_STICKERS,
): ChatusStickerRef[] {
  return [pick, ...prev.filter((x) => !sameRef(x, pick))].slice(0, max);
}

/** Сохраняет порядок: оставляет первое вхождение каждого `packId:stickerId`. */
export function dedupeStickerRefsPreserveOrder(items: ChatusStickerRef[]): ChatusStickerRef[] {
  const seen = new Set<string>();
  const out: ChatusStickerRef[] = [];
  for (const r of items) {
    const k = `${r.packId}:${r.stickerId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}
