import type { StickerSheetItem } from './chatusStickerCatalog';

/** Нормализация для сравнения: нижний регистр, без дефисов и пробелов. */
function normKey(s: string): string {
  return s.toLowerCase().replace(/-/g, '').replace(/\s+/g, '');
}

/**
 * Минимальный поиск по каталогу (фаза 2.2 журнала): подстрока в `packId:stickerId`,
 * дефисы в запросе и в id игнорируются (удобно для `1f642-200d-2195-fe0f`).
 */
export function stickerItemMatchesQuery(item: StickerSheetItem, rawQuery: string): boolean {
  const q = normKey(rawQuery.trim());
  if (!q) return true;
  const hay = normKey(`${item.packId}:${item.stickerId}`);
  return hay.includes(q);
}

export function filterStickerSheetItems(items: StickerSheetItem[], rawQuery: string): StickerSheetItem[] {
  return items.filter((it) => stickerItemMatchesQuery(it, rawQuery));
}
