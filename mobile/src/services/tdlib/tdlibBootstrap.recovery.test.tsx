/**
 * recoverTdlibAuthSession: связка чистой логики восстановления с клиентом TDLib.
 * Запуск: npx jest src/services/tdlib/tdlibBootstrap.recovery.test.tsx
 */
type Listener = (update: Record<string, unknown>) => void;

const mockTd: {
  last: string | null; // что знает JS по апдейтам
  real: string; // что ответил бы TDLib на getAuthorizationState
  silent: boolean; // клиент закрыт и на запросы не отвечает
  listeners: Set<Listener>;
  sent: string[];
  restarts: number;
  params: number;
  restartError: Error | null;
} = {
  last: null,
  real: 'authorizationStateWaitPhoneNumber',
  silent: false,
  listeners: new Set(),
  sent: [],
  restarts: 0,
  params: 0,
  restartError: null,
};

const mockEmitState = (state: string) => {
  mockTd.last = state;
  mockTd.real = state;
  for (const listener of [...mockTd.listeners]) {
    listener({ '@type': 'updateAuthorizationState', authorization_state: { '@type': state } });
  }
};

jest.mock('./TdlibClient', () => ({
  getTelegramBuildCredentials: () => ({ apiId: 1, apiHash: 'hash' }),
  tdlibClient: {
    getLastAuthorizationState: () => mockTd.last,
    subscribe: (listener: Listener) => {
      mockTd.listeners.add(listener);
      return () => mockTd.listeners.delete(listener);
    },
    restartClient: async () => {
      if (mockTd.restartError) throw mockTd.restartError;
      mockTd.restarts += 1;
      mockTd.silent = false;
      mockTd.last = null;
      mockTd.real = 'authorizationStateWaitTdlibParameters';
    },
    send: (query: Record<string, unknown>) => {
      const type = query['@type'] as string;
      mockTd.sent.push(type);
      if (mockTd.silent) return new Promise(() => undefined);
      if (type === 'getAuthorizationState') return Promise.resolve({ '@type': mockTd.real });
      if (type === 'setTdlibParameters') {
        mockTd.params += 1;
        mockTd.real = 'authorizationStateWaitPhoneNumber';
      }
      return Promise.resolve({ '@type': 'ok' });
    },
  },
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///data/files/',
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
}));

import { recoverTdlibAuthSession } from './tdlibBootstrap';

beforeEach(() => {
  jest.useFakeTimers();
  mockTd.last = null;
  mockTd.real = 'authorizationStateWaitPhoneNumber';
  mockTd.silent = false;
  mockTd.listeners.clear();
  mockTd.sent = [];
  mockTd.restarts = 0;
  mockTd.params = 0;
  mockTd.restartError = null;
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('recoverTdlibAuthSession', () => {
  it('живой клиент не трогает', async () => {
    mockTd.last = 'authorizationStateWaitPhoneNumber';
    const result = await recoverTdlibAuthSession();
    expect(result.action).toBe('none');
    expect(mockTd.restarts).toBe(0);
    expect(mockTd.sent).not.toContain('destroy');
  });

  it('выход завершился сам: дождались Closed, создали нового клиента и передали параметры', async () => {
    mockEmitState('authorizationStateLoggingOut');
    const promise = recoverTdlibAuthSession();
    await jest.advanceTimersByTimeAsync(1500);
    mockEmitState('authorizationStateClosed');
    const result = await promise;
    expect(result.action).toBe('restarted');
    expect(mockTd.restarts).toBe(1);
    expect(mockTd.params).toBe(1);
    expect(mockTd.sent).not.toContain('destroy');
    expect(result.stateAfter).toBe('authorizationStateWaitPhoneNumber');
  });

  it('регрессия: нет связи с Telegram, выход не завершается -> destroy, затем новый клиент', async () => {
    mockEmitState('authorizationStateLoggingOut');
    const promise = recoverTdlibAuthSession();
    await jest.advanceTimersByTimeAsync(8100); // время ожидания вышло
    expect(mockTd.sent).toContain('destroy');
    expect(mockTd.restarts).toBe(0);
    mockEmitState('authorizationStateClosing');
    mockEmitState('authorizationStateClosed'); // destroy довёл клиента до Closed
    const result = await promise;
    expect(result.action).toBe('destroyed');
    expect(mockTd.restarts).toBe(1);
    expect(mockTd.params).toBe(1);
  });

  it('не закрылся даже после destroy: понятная ошибка и никакого нового клиента', async () => {
    mockEmitState('authorizationStateLoggingOut');
    const settled = recoverTdlibAuthSession().then(
      () => 'ok',
      (error: Error) => error.message,
    );
    await jest.advanceTimersByTimeAsync(8100 + 8100 + 100);
    await expect(settled).resolves.toMatch(/Закройте приложение полностью/);
    expect(mockTd.restarts).toBe(0);
  });

  it('уже закрыт: пересоздаёт сразу', async () => {
    mockEmitState('authorizationStateClosed');
    const result = await recoverTdlibAuthSession();
    expect(result.action).toBe('restarted');
    expect(mockTd.restarts).toBe(1);
    expect(mockTd.sent).not.toContain('destroy');
  });

  it('одновременные вызовы делят один проход', async () => {
    mockEmitState('authorizationStateClosed');
    const first = recoverTdlibAuthSession();
    const second = recoverTdlibAuthSession();
    expect(second).toBe(first);
    await first;
    expect(mockTd.restarts).toBe(1);
  });

  it('после завершения можно запустить новый проход', async () => {
    mockEmitState('authorizationStateClosed');
    await recoverTdlibAuthSession();
    mockEmitState('authorizationStateClosed');
    await recoverTdlibAuthSession();
    expect(mockTd.restarts).toBe(2);
  });

  it('ошибка пересоздания (старая сборка) пробрасывается и не залипает', async () => {
    mockEmitState('authorizationStateClosed');
    mockTd.restartError = new Error('Эта сборка не умеет перезапускать Telegram');
    await expect(recoverTdlibAuthSession()).rejects.toThrow(/не умеет перезапускать/);
    mockTd.restartError = null;
    mockEmitState('authorizationStateClosed');
    await expect(recoverTdlibAuthSession()).resolves.toMatchObject({ action: 'restarted' });
  });

  it('сразу после logOut (клиент ещё "живой") assumeState запускает ожидание закрытия', async () => {
    mockTd.last = 'authorizationStateReady';
    const promise = recoverTdlibAuthSession({ assumeState: 'authorizationStateLoggingOut' });
    await jest.advanceTimersByTimeAsync(500);
    mockEmitState('authorizationStateClosed');
    await expect(promise).resolves.toMatchObject({
      action: 'restarted',
      stateBefore: 'authorizationStateLoggingOut',
    });
  });

  it('клиент молчит и апдейтов не было: считается закрытым и пересоздаётся', async () => {
    mockTd.last = null;
    mockTd.silent = true; // закрытый клиент на getAuthorizationState не отвечает
    const promise = recoverTdlibAuthSession();
    await jest.advanceTimersByTimeAsync(4100);
    const result = await promise;
    expect(result.action).toBe('restarted');
    expect(result.stateBefore).toBeNull();
    expect(mockTd.restarts).toBe(1);
    expect(mockTd.params).toBe(1);
  });
});
