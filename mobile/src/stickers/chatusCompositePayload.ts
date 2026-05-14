import type { ChatusStickerRef } from './chatusStickerPayload';

const COMPOSITE_T = 'cb';

export type CompositeTextPart = { t: 'txt'; v: string };
export type CompositeStickerPart = { t: 'cs'; p: string; i: string };
export type CompositePart = CompositeTextPart | CompositeStickerPart;

export type ParsedComposite = { t: typeof COMPOSITE_T; parts: CompositePart[] };

export function encodeTextWithStickerTails(text: string, refs: ChatusStickerRef[]): string {
  const trimmed = text.trimEnd();
  const parts: CompositePart[] = [{ t: 'txt', v: trimmed }];
  for (const ref of refs) {
    parts.push({ t: 'cs', p: ref.packId, i: ref.stickerId });
  }
  return JSON.stringify({ t: COMPOSITE_T, parts });
}

export function encodeTextWithStickerTail(text: string, ref: ChatusStickerRef): string {
  return encodeTextWithStickerTails(text, [ref]);
}

export function tryParseCompositeMessage(content: string | null | undefined): ParsedComposite | null {
  const raw = content?.trim();
  if (!raw || raw[0] !== '{') return null;
  try {
    const o = JSON.parse(raw) as ParsedComposite;
    if (o?.t !== COMPOSITE_T || !Array.isArray(o.parts) || o.parts.length < 2) return null;
    const parts = o.parts as CompositePart[];
    const first = parts[0];
    if (!first || first.t !== 'txt' || typeof first.v !== 'string') return null;
    for (let k = 1; k < parts.length; k += 1) {
      const p = parts[k];
      if (!p || p.t !== 'cs' || typeof p.p !== 'string' || typeof p.i !== 'string') return null;
    }
    return { t: COMPOSITE_T, parts };
  } catch {
    return null;
  }
}

export function isCompositeTextStickerMessage(content: string | null | undefined): boolean {
  return !!tryParseCompositeMessage(content);
}

export function getCompositeStickerRefs(parsed: ParsedComposite): ChatusStickerRef[] {
  const out: ChatusStickerRef[] = [];
  for (const p of parsed.parts) {
    if (p?.t === 'cs' && typeof p.p === 'string' && typeof p.i === 'string') {
      out.push({ packId: p.p, stickerId: p.i });
    }
  }
  return out;
}

/** Последний стикер в цепочке (обратная совместимость для мест, где нужен один ref). */
export function getCompositeStickerRef(parsed: ParsedComposite): ChatusStickerRef | null {
  const refs = getCompositeStickerRefs(parsed);
  return refs.length ? refs[refs.length - 1]! : null;
}

export function getCompositeTextBody(parsed: ParsedComposite): string {
  const first = parsed.parts[0];
  if (first?.t === 'txt' && typeof first.v === 'string') return first.v;
  return '';
}
