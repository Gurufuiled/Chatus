import assert from 'node:assert/strict';
import {
  createAuthKeyDropAlertActions,
  performConfirmedAuthKeyDropLogout,
} from './tdlibServiceNotificationActions';

void (async () => {
  const order: string[] = [];
  const queries: Array<{ '@type': string }> = [];
  let confirmClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    confirmClosed = resolve;
  });
  const logout = performConfirmedAuthKeyDropLogout({
    enterExclusiveDestroyMode: () => order.push('exclusive'),
    sendTdlib: async (query) => {
      queries.push(query);
      order.push('destroy');
    },
    waitForClosed: async () => {
      order.push('wait-closed');
      await closed;
    },
    clearLocalSession: async () => {
      order.push('clear-local');
    },
    prepareFreshLogin: async () => {
      order.push('prepare-login');
    },
  });
  await Promise.resolve();
  assert.deepEqual(order, ['exclusive', 'destroy', 'wait-closed']);
  assert.equal(order.includes('clear-local'), false, 'must not clear before Closed');
  confirmClosed();
  await logout;
  assert.deepEqual(queries, [{ '@type': 'destroy' }]);
  assert.equal(queries.some((query) => query['@type'] === 'logOut'), false);
  assert.deepEqual(order, [
    'exclusive',
    'destroy',
    'wait-closed',
    'clear-local',
    'prepare-login',
  ]);

  let clearedAfterTimeout = false;
  await assert.rejects(
    performConfirmedAuthKeyDropLogout({
      enterExclusiveDestroyMode: () => undefined,
      sendTdlib: async () => undefined,
      waitForClosed: async () => {
        throw new Error('Closed timeout');
      },
      clearLocalSession: async () => {
        clearedAfterTimeout = true;
      },
      prepareFreshLogin: async () => undefined,
    }),
    /Closed timeout/,
  );
  assert.equal(clearedAfterTimeout, false);

  await assert.rejects(
    performConfirmedAuthKeyDropLogout({
      enterExclusiveDestroyMode: () => undefined,
      sendTdlib: async () => undefined,
      waitForClosed: async () => undefined,
      clearLocalSession: async () => undefined,
      prepareFreshLogin: async () => {
        throw new Error('native failure');
      },
    }),
    /не удалось подготовить новый вход/i,
  );

  const orderAfterSendReject: string[] = [];
  await performConfirmedAuthKeyDropLogout({
    enterExclusiveDestroyMode: () => orderAfterSendReject.push('exclusive'),
    sendTdlib: async () => {
      orderAfterSendReject.push('destroy-reject');
      throw new Error('native already closed');
    },
    waitForClosed: async () => {
      orderAfterSendReject.push('closed');
    },
    clearLocalSession: async () => {
      orderAfterSendReject.push('clear-local');
    },
    prepareFreshLogin: async () => {
      orderAfterSendReject.push('prepare-login');
    },
  });
  assert.deepEqual(orderAfterSendReject, [
    'exclusive',
    'destroy-reject',
    'closed',
    'clear-local',
    'prepare-login',
  ]);

  await assert.rejects(
    performConfirmedAuthKeyDropLogout({
      enterExclusiveDestroyMode: () => undefined,
      sendTdlib: async () => {
        throw new Error('send failed');
      },
      waitForClosed: async () => {
        throw new Error('Closed timeout');
      },
      clearLocalSession: async () => {
        throw new Error('must not clear');
      },
      prepareFreshLogin: async () => undefined,
    }),
    /Не удалось завершить сессию Telegram/,
  );

  let released = 0;
  let started = 0;
  let performed = 0;
  let finished = 0;
  let errors = 0;
  const actions = createAuthKeyDropAlertActions({
    releaseAlert: () => {
      released += 1;
    },
    startAction: () => {
      started += 1;
    },
    finishAction: () => {
      finished += 1;
    },
    performLogout: async () => {
      performed += 1;
      throw new Error('expected failure');
    },
    onError: () => {
      errors += 1;
    },
  });
  actions.cancel();
  assert.deepEqual({ released, started, performed, finished, errors }, {
    released: 1,
    started: 0,
    performed: 0,
    finished: 0,
    errors: 0,
  });

  actions.confirm();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.deepEqual({ released, started, performed, finished, errors }, {
    released: 2,
    started: 1,
    performed: 1,
    finished: 1,
    errors: 1,
  });

  console.log('tdlibServiceNotificationActions.test.ts OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
