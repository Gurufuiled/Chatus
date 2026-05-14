/**
 * Расчёты вёрстки панели стикеров / emoji (`StickerPackSheet`).
 * Вынесены в pure-функции для unit-тестов (регрессии «сетка вылезла за экран»).
 */

export const STICKER_PANEL_PACK_RAIL_W = 52;
export const STICKER_PANEL_STICKER_COLS = 4;
export const STICKER_PANEL_STICKER_GAP = 8;
export const STICKER_PANEL_STICKER_SIDE_PAD = 12;
export const STICKER_PANEL_EMOJI_COLUMNS = 8;
/** Суммарный горизонтальный запас под emoji grid (см. `emojiGridPad` в шторке). */
export const STICKER_PANEL_EMOJI_H_MARGIN = 20;

export function computeStickerMainWidth(windowWidth: number, hairlineWidth: number): number {
  return Math.max(120, windowWidth - STICKER_PANEL_PACK_RAIL_W - hairlineWidth);
}

export function computeStickerThumbSize(mainWidth: number): number {
  const inner = Math.max(
    0,
    mainWidth -
      STICKER_PANEL_STICKER_SIDE_PAD * 2 -
      STICKER_PANEL_STICKER_GAP * (STICKER_PANEL_STICKER_COLS - 1),
  );
  const raw = Math.floor(inner / STICKER_PANEL_STICKER_COLS);
  let thumb = Math.min(72, raw);
  /** 52dp только если в строку реально помещается 4×52 + отступы. */
  if (inner >= 52 * STICKER_PANEL_STICKER_COLS) {
    thumb = Math.max(52, thumb);
  }
  /** На совсем узком main (редкий edge) ячейки могут быть <52, иначе сетка шире main. */
  return Math.max(18, thumb);
}

export function computeEmojiCellSize(windowWidth: number): number {
  const inner = Math.max(1, windowWidth - STICKER_PANEL_EMOJI_H_MARGIN);
  const raw = Math.floor(inner / STICKER_PANEL_EMOJI_COLUMNS);
  return Math.min(42, Math.max(26, raw));
}

/** Ширина контента одной строки сетки стикеров (паддинги `gridPad` + 4 ячейки + gap). */
export function computeStickerGridRowUsedWidth(thumbSize: number): number {
  return (
    STICKER_PANEL_STICKER_SIDE_PAD * 2 +
    thumbSize * STICKER_PANEL_STICKER_COLS +
    STICKER_PANEL_STICKER_GAP * (STICKER_PANEL_STICKER_COLS - 1)
  );
}
