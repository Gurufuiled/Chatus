import assert from 'node:assert/strict';
import { formatStickerPanelTopTabAnnouncement } from './stickerPanelA11y';

assert.equal(formatStickerPanelTopTabAnnouncement(0, 'Emoji', 3), 'Вкладка 1 из 3: Emoji');
assert.equal(formatStickerPanelTopTabAnnouncement(1, 'Стикеры', 3), 'Вкладка 2 из 3: Стикеры');
assert.equal(formatStickerPanelTopTabAnnouncement(2, 'GIF', 3), 'Вкладка 3 из 3: GIF');

assert.equal(formatStickerPanelTopTabAnnouncement(0, 'A', 0), 'Вкладка 1 из 1: A', 'totalTabs<=0 → 1');
assert.equal(formatStickerPanelTopTabAnnouncement(99, 'X', 2), 'Вкладка 2 из 2: X', 'clamp index');

console.log('stickerPanelA11y.test.ts OK');
