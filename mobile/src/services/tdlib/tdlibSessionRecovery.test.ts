import assert from 'node:assert/strict';
import {
  AUTH_STATE_CLOSED,
  DEAD_AUTH_STATES,
  SessionRecoveryError,
  isDeadAuthState,
  recoverTdlibSession,
  type SessionRecoveryDeps,
} from './tdlibSessionRecovery';

const LOGGING_OUT = 'authorizationStateLoggingOut';
const CLOSING = 'authorizationStateClosing';
const WAIT_PHONE = 'authorizationStateWaitPhoneNumber';

/** Фейковая среда: журнал вызовов + управляемые ответы. */
function makeDeps(opts: {
  states: Array<string | null>; // ответы readState по очереди (последний повторяется)
  closedAfter?: 'never' | 'grace' | 'destroy'; // когда TDLib «закрывается»
  restartError?: Error;
  destroyError?: Error;
}) {
  const calls: string[] = [];
  let stateIndex = 0;
  let destroyed = false;
  const deps: SessionRecoveryDeps = {
    readState: async () => {
      calls.push('readState');
      const value = opts.states[Math.min(stateIndex, opts.states.length - 1)];
      stateIndex += 1;
      return value;
    },
    waitClosed: async (ms) => {
      calls.push(`waitClosed:${ms}`);
      if (opts.closedAfter === 'grace') return true;
      if (opts.closedAfter === 'destroy') return destroyed;
      return false;
    },
    destroy: async () => {
      calls.push('destroy');
      destroyed = true;
      if (opts.destroyError) throw opts.destroyError;
    },
    restartClient: async () => {
      calls.push('restartClient');
      if (opts.restartError) throw opts.restartError;
    },
    reinitialize: async () => {
      calls.push('reinitialize');
    },
  };
  return { deps, calls };
}

async function main() {
  // ── константы и предикат ──
  assert.deepEqual([...DEAD_AUTH_STATES].sort(), [CLOSING, AUTH_STATE_CLOSED, LOGGING_OUT].sort());
  assert.equal(isDeadAuthState(LOGGING_OUT), true);
  assert.equal(isDeadAuthState(CLOSING), true);
  assert.equal(isDeadAuthState(AUTH_STATE_CLOSED), true);
  assert.equal(isDeadAuthState(WAIT_PHONE), false);
  assert.equal(isDeadAuthState('authorizationStateReady'), false);
  assert.equal(isDeadAuthState(null), false);
  assert.equal(isDeadAuthState(undefined), false);

  // ── клиент жив: ничего не делаем ──
  for (const live of [WAIT_PHONE, 'authorizationStateReady', 'authorizationStateWaitCode', 'authorizationStateWaitTdlibParameters']) {
    const { deps, calls } = makeDeps({ states: [live] });
    const result = await recoverTdlibSession(deps);
    assert.equal(result.action, 'none', live);
    assert.equal(result.stateBefore, live);
    assert.deepEqual(calls, ['readState'], 'живой клиент не трогаем: ни destroy, ни перезапуска');
  }

  // ── выход завершился сам: дождались Closed, пересоздали клиента ──
  {
    const { deps, calls } = makeDeps({ states: [LOGGING_OUT, WAIT_PHONE], closedAfter: 'grace' });
    const result = await recoverTdlibSession(deps);
    assert.equal(result.action, 'restarted');
    assert.equal(result.stateBefore, LOGGING_OUT);
    assert.equal(result.stateAfter, WAIT_PHONE);
    assert.deepEqual(calls, ['readState', 'waitClosed:8000', 'restartClient', 'reinitialize', 'readState']);
    assert.ok(!calls.includes('destroy'), 'если выход завершился сам, destroy не нужен');
  }

  // ── регрессия: нет связи с Telegram, выход не завершается → destroy, затем новый клиент ──
  {
    const { deps, calls } = makeDeps({ states: [LOGGING_OUT, WAIT_PHONE], closedAfter: 'destroy' });
    const result = await recoverTdlibSession(deps);
    assert.equal(result.action, 'destroyed');
    assert.deepEqual(calls, [
      'readState',
      'waitClosed:8000',
      'destroy',
      'waitClosed:8000',
      'restartClient',
      'reinitialize',
      'readState',
    ]);
  }

  // ── Closing ведёт себя так же, как LoggingOut ──
  {
    const { deps } = makeDeps({ states: [CLOSING, WAIT_PHONE], closedAfter: 'grace' });
    assert.equal((await recoverTdlibSession(deps)).action, 'restarted');
  }

  // ── уже Closed: ждать нечего, сразу пересоздаём ──
  {
    const { deps, calls } = makeDeps({ states: [AUTH_STATE_CLOSED, WAIT_PHONE] });
    const result = await recoverTdlibSession(deps);
    assert.equal(result.action, 'restarted');
    assert.deepEqual(calls, ['readState', 'restartClient', 'reinitialize', 'readState']);
  }

  // ── клиент молчит (null): закрыт — пересоздаём, не ждём и не делаем destroy ──
  {
    const { deps, calls } = makeDeps({ states: [null, WAIT_PHONE] });
    const result = await recoverTdlibSession(deps);
    assert.equal(result.action, 'restarted');
    assert.equal(result.stateBefore, null);
    assert.deepEqual(calls, ['readState', 'restartClient', 'reinitialize', 'readState']);
  }

  // ── ошибка destroy (ответа от TDLib нет) не мешает: закрытие ждём по апдейтам ──
  {
    const { deps } = makeDeps({
      states: [LOGGING_OUT, WAIT_PHONE],
      closedAfter: 'destroy',
      destroyError: new Error('нет ответа'),
    });
    assert.equal((await recoverTdlibSession(deps)).action, 'destroyed');
  }

  // ── не закрылся даже после destroy: понятная ошибка, клиента не пересоздаём (база занята) ──
  {
    const { deps, calls } = makeDeps({ states: [LOGGING_OUT], closedAfter: 'never' });
    await assert.rejects(
      () => recoverTdlibSession(deps),
      (error: unknown) => {
        assert.ok(error instanceof SessionRecoveryError);
        assert.match((error as Error).message, /Закройте приложение полностью/);
        return true;
      },
    );
    assert.ok(!calls.includes('restartClient'), 'пока старый клиент держит базу, новый создавать нельзя');
  }

  // ── ошибки пересоздания пробрасываются (нативный метод отсутствует в старой сборке) ──
  {
    const { deps } = makeDeps({
      states: [AUTH_STATE_CLOSED],
      restartError: new Error('Эта сборка не умеет перезапускать Telegram'),
    });
    await assert.rejects(() => recoverTdlibSession(deps), /не умеет перезапускать/);
  }

  // ── свои таймауты ──
  {
    const { deps, calls } = makeDeps({ states: [LOGGING_OUT, WAIT_PHONE], closedAfter: 'destroy' });
    await recoverTdlibSession(deps, { graceMs: 100, destroyWaitMs: 200 });
    assert.ok(calls.includes('waitClosed:100'));
    assert.ok(calls.includes('waitClosed:200'));
  }

  // ── сразу после logOut readState ещё показывает «живое» состояние: assumeState считает клиента в выходе ──
  {
    const { deps, calls } = makeDeps({ states: ['authorizationStateReady', WAIT_PHONE], closedAfter: 'grace' });
    const result = await recoverTdlibSession(deps, { assumeState: LOGGING_OUT });
    assert.equal(result.action, 'restarted');
    assert.equal(result.stateBefore, LOGGING_OUT);
    assert.ok(calls.includes('restartClient'));
  }
  // …но если клиент уже в выходе, assumeState ничего не меняет
  {
    const { deps } = makeDeps({ states: [AUTH_STATE_CLOSED, WAIT_PHONE] });
    const result = await recoverTdlibSession(deps, { assumeState: LOGGING_OUT });
    assert.equal(result.stateBefore, AUTH_STATE_CLOSED);
  }

  console.log('tdlibSessionRecovery.test.ts: ok');
}

void main();
