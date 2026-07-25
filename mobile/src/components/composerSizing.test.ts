import assert from 'node:assert/strict';
import {
  COMPOSER_INPUT_MAX_HEIGHT,
  COMPOSER_INPUT_MIN_HEIGHT,
  clampComposerInputHeight,
  shouldScrollComposerInput,
} from './composerSizing';

assert.equal(clampComposerInputHeight(20), COMPOSER_INPUT_MIN_HEIGHT);
assert.equal(clampComposerInputHeight(78.2), 79);
assert.equal(clampComposerInputHeight(400), COMPOSER_INPUT_MAX_HEIGHT);
assert.equal(clampComposerInputHeight(Number.NaN), COMPOSER_INPUT_MIN_HEIGHT);

assert.equal(shouldScrollComposerInput(COMPOSER_INPUT_MAX_HEIGHT - 1), false);
assert.equal(shouldScrollComposerInput(COMPOSER_INPUT_MAX_HEIGHT), true);

console.log('composerSizing: OK');
