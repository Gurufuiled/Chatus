import assert from 'node:assert/strict';
import {
  COMPOSER_INPUT_MAX_HEIGHT,
  COMPOSER_INPUT_MIN_HEIGHT,
  clampComposerInputHeight,
  composerInputHeightForLineCount,
  shouldScrollComposerInput,
} from './composerSizing';

assert.equal(clampComposerInputHeight(20), COMPOSER_INPUT_MIN_HEIGHT);
assert.equal(clampComposerInputHeight(78.2), 79);
assert.equal(clampComposerInputHeight(400), COMPOSER_INPUT_MAX_HEIGHT);
assert.equal(clampComposerInputHeight(Number.NaN), COMPOSER_INPUT_MIN_HEIGHT);

assert.equal(shouldScrollComposerInput(COMPOSER_INPUT_MAX_HEIGHT - 1), false);
assert.equal(shouldScrollComposerInput(COMPOSER_INPUT_MAX_HEIGHT), true);

assert.equal(composerInputHeightForLineCount(1, 22), COMPOSER_INPUT_MIN_HEIGHT);
assert.equal(composerInputHeightForLineCount(2, 22), 65);
assert.equal(composerInputHeightForLineCount(5, 22), 131);
assert.equal(
  composerInputHeightForLineCount(20, 22),
  COMPOSER_INPUT_MAX_HEIGHT,
);

console.log('composerSizing: OK');
