import assert from 'node:assert/strict';
import { PeerDeliveryService } from './PeerDeliveryService';

async function run(): Promise<void> {
  const result = await PeerDeliveryService.attemptTextMessage({
    chatId: 'chat-1',
    recipientUserId: 'user-2',
    content: 'hello',
    tempId: 'temp-1',
    timeoutMs: 2500,
  });

  assert.deepEqual(result, { ok: false, reason: 'not_implemented' });
}

void run();
