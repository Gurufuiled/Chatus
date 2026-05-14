import type { ChatusStickerRef } from './chatusStickerPayload';

const COMPOSITE_T = 'cb';

export type CompositeTextPart = { t: 'txt'; v: string };
export type CompositeStickerPart = { t: 'cs'; p: string; i: string };
export type CompositePart = CompositeTextPart | CompositeStickerPart;

export type ParsedComposite = { t: typeof COMPOSITE_T; parts: CompositePart[] };

export function encodeTextWithStickerTail(text: string, ref: ChatusStickerRef): string {
  const trimmed = text.trimEnd();
  return JSON.stringify({
    t: COMPOSITE_T,
    parts: [
      { t: 'txt', v: trimmed },
      { t: 'cs', p: ref.packId, i: ref.stickerId },
    ] satisfies CompositePart[],
  });
}

export function tryParseCompositeMessage(content: string | null | undefined): ParsedComposite | null {
  const raw = content?.trim();
  if (!raw || raw[0] !== '{') return null;
  try {
    const o = JSON.parse(raw) as ParsedComposite;
    if (o?.t !== COMPOSITE_T || !Array.isArray(o.parts) || o.parts.length < 2) return null;
    const parts = o.parts as CompositePart[];
    const last = parts[parts.length - 1];
    if (!last || last.t !== 'cs' || typeof last.p !== 'string' || typeof last.i !== 'string') return null;
    const first = parts[0];
    if (!first || first.t !== 'txt' || typeof first.v !== 'string') return null;
    return { t: COMPOSITE_T, parts };
  } catch {
    return null;
  }
}

export function isCompositeTextStickerMessage(content: string | null | undefined): boolean {
  return !!tryParseCompositeMessage(content);
}

export function getCompositeStickerRef(parsed: ParsedComposite): ChatusStickerRef | null {
  for (let i = parsed.parts.length - 1; i >= 0; i -= 1) {
    const p = parsed.parts[i];
    if (p?.t === 'cs' && typeof p.p === 'string' && typeof p.i === 'string') {
      return { packId: p.p, stickerId: p.i };
    }
  }
  return null;
}

export function getCompositeTextBody(parsed: ParsedComposite): string {
  const first = parsed.parts[0];
  if (first?.t === 'txt' && typeof first.v === 'string') return first.v;
  return '';
}
