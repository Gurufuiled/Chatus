/**
 * Pure inbound signaling DM frames — runnable with `npm run test:peer-delivery` (no RN bundler).
 */

import assert from 'node:assert/strict';

import type { PeerDeliveryResult } from './peerDeliverySignal';
import { dispatchRawPeerDeliverySignal, type PendingPeerDm } from './peerDeliverySignal';

let resolved: PeerDeliveryResult | undefined;
const noopTimer = setTimeout(() => undefined, 60_000) as ReturnType<typeof setTimeout>;

const pending = new Map<string, PendingPeerDm>([
  [
    'ack-1',
    {
      resolve: (v) => {
        resolved = v;
      },
      timer: noopTimer,
    },
  ],
]);

dispatchRawPeerDeliverySignal(
  JSON.stringify({ type: 'dm_fallback', ack_key: 'ack-1' }),
  pending,
  [],
);

assert.strictEqual(resolved?.ok, false);
if (!resolved?.ok) {
  assert.strictEqual(resolved.reason, 'unavailable');
}

assert.ok(!pending.has('ack-1'));
clearTimeout(noopTimer);
