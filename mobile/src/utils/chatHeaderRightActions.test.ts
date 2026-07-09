import assert from 'node:assert/strict';
import { PILL_TITLE_SIDE_INSET } from './chatHeaderRightActions';

function testPillTitleSideInset() {
  assert.equal(PILL_TITLE_SIDE_INSET, 56);
}

testPillTitleSideInset();

console.log('chatHeaderRightActions.test.ts: ok');
