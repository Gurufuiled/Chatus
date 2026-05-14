import * as SecureStore from 'expo-secure-store';
import { canonicalFriendStickerRef } from './chatusStickerCatalog';
import type { ChatusStickerRef } from './chatusStickerPayload';
import { dedupeStickerRefsPreserveOrder, MAX_RECENT_STICKERS, mergeMruStickerRefs } from './recentStickerMru';

const STORAGE_KEY = 'chatus_recent_stickers_v1';

export type RecentStickerRef = ChatusStickerRef;

export async function loadRecentStickers(): Promise<RecentStickerRef[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: RecentStickerRef[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const p = (row as { packId?: unknown }).packId;
      const i = (row as { stickerId?: unknown }).stickerId;
      if (typeof p === 'string' && typeof i === 'string' && p.length > 0 && i.length > 0) {
        out.push(canonicalFriendStickerRef({ packId: p, stickerId: i }));
      }
    }
    return dedupeStickerRefsPreserveOrder(out).slice(0, MAX_RECENT_STICKERS);
  } catch {
    return [];
  }
}

/** MRU: последний выбор в начало, без дублей, обрезка до MAX. */
export async function rememberStickerPick(ref: RecentStickerRef): Promise<RecentStickerRef[]> {
  const prev = await loadRecentStickers();
  const next = mergeMruStickerRefs(prev, ref);
  void SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
  return next;
}
