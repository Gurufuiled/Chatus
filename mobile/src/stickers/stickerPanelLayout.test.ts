import assert from 'node:assert/strict';
import {
  computeEmojiCellSize,
  computeStickerGridRowUsedWidth,
  computeStickerMainWidth,
  computeStickerThumbSize,
  STICKER_PANEL_EMOJI_COLUMNS,
} from './stickerPanelLayout';

function assertStickerGridFits(windowWidth: number, hairline: number): void {
  const main = computeStickerMainWidth(windowWidth, hairline);
  const thumb = computeStickerThumbSize(main);
  const used = computeStickerGridRowUsedWidth(thumb);
  assert.ok(
    used <= main + 0.5,
    `sticker grid overflow: window=${windowWidth} main=${main} thumb=${thumb} used=${used}`,
  );
}

function assertEmojiRowFits(windowWidth: number): void {
  const cell = computeEmojiCellSize(windowWidth);
  const used = STICKER_PANEL_EMOJI_COLUMNS * cell + 20;
  assert.ok(
    used <= windowWidth + 0.5,
    `emoji row overflow: window=${windowWidth} cell=${cell} used=${used}`,
  );
}

assert.equal(computeStickerMainWidth(360, 1), 307);
assert.equal(computeStickerThumbSize(307), 64);
assertStickerGridFits(360, 1);
assertStickerGridFits(320, 1);
assertStickerGridFits(280, 1);
assertStickerGridFits(260, 1);

assert.equal(computeStickerThumbSize(120), 18, 'узкий main — ячейка ужимается, без переполнения');

const wideMain = computeStickerMainWidth(900, 0);
assert.equal(computeStickerThumbSize(wideMain), 72, 'на широком экране — потолок 72');

for (let w = 260; w <= 430; w += 1) {
  assertStickerGridFits(w, 1);
  assertEmojiRowFits(w);
}

console.log('stickerPanelLayout.test.ts OK');
