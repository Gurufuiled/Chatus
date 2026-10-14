/**
 * Клиент TDLib: запоминает состояние авторизации из апдейтов и пересоздаёт нативного клиента.
 * Запуск: npx jest src/services/tdlib/TdlibClient.test.tsx
 */
const mockEmitterHandlers: Record<string, (payload: { json?: string }) => void> = {};
const mockNative: {
  sendClientJson: jest.Mock;
  restartClient?: jest.Mock;
  addListener: jest.Mock;
  removeListeners: jest.Mock;
} = {
  sendClientJson: jest.fn(() => Promise.resolve('{"@type":"ok"}')),
  restartClient: jest.fn(() => Promise.resolve(2)),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};

// TdlibClient использует из react-native только эти три сущности; настоящий модуль тянет нативные спеки
jest.mock('react-native', () => {
  class MockEmitter {
    addListener(event: string, handler: (payload: { json?: string }) => void) {
      mockEmitterHandlers[event] = handler;
      return { remove: jest.fn() };
    }
  }
  return {
    NativeModules: { Tdlib: mockNative },
    NativeEventEmitter: MockEmitter,
    Platform: { OS: 'android' },
  };
});
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

// rAF в jest-окружении может отсутствовать — батч апдейтов не важен для этих проверок
(globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame = (cb) => {
  cb();
  return 0;
};

// require, а не import: import поднимается выше определения mockNative, и фабрика мока получила бы undefined
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { tdlibClient } = require('./TdlibClient') as typeof import('./TdlibClient');

const emitAuthState = (state: string) =>
  mockEmitterHandlers.td_json_update({
    json: JSON.stringify({
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': state },
    }),
  });

describe('TdlibClient: состояние авторизации из апдейтов', () => {
  it('до первого апдейта состояния нет', () => {
    expect(tdlibClient.getLastAuthorizationState()).toBeNull();
  });

  it('запоминает последнее состояние (нужно, чтобы узнать про Closed: закрытый клиент на запросы молчит)', () => {
    emitAuthState('authorizationStateLoggingOut');
    expect(tdlibClient.getLastAuthorizationState()).toBe('authorizationStateLoggingOut');
    emitAuthState('authorizationStateClosed');
    expect(tdlibClient.getLastAuthorizationState()).toBe('authorizationStateClosed');
  });

  it('прочие апдейты и мусор состояние не меняют', () => {
    mockEmitterHandlers.td_json_update({ json: '{"@type":"updateNewMessage"}' });
    mockEmitterHandlers.td_json_update({ json: 'не json' });
    mockEmitterHandlers.td_json_update({});
    expect(tdlibClient.getLastAuthorizationState()).toBe('authorizationStateClosed');
  });

  it('подписчики получают апдейт', () => {
    const listener = jest.fn();
    const unsubscribe = tdlibClient.subscribe(listener);
    emitAuthState('authorizationStateWaitPhoneNumber');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    emitAuthState('authorizationStateWaitCode');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('TdlibClient.restartClient', () => {
  it('вызывает нативный restartClient и сбрасывает запомненное состояние', async () => {
    emitAuthState('authorizationStateClosed');
    await tdlibClient.restartClient();
    expect(mockNative.restartClient).toHaveBeenCalledTimes(1);
    expect(tdlibClient.getLastAuthorizationState()).toBeNull();
  });

  it('если нативная ошибка — пробрасывает, состояние не сбрасывает', async () => {
    emitAuthState('authorizationStateClosed');
    mockNative.restartClient!.mockRejectedValueOnce(new Error('E_TD_RESTART'));
    await expect(tdlibClient.restartClient()).rejects.toThrow('E_TD_RESTART');
    expect(tdlibClient.getLastAuthorizationState()).toBe('authorizationStateClosed');
  });

  it('в старой сборке без нативного метода — понятная ошибка', async () => {
    const original = mockNative.restartClient;
    delete mockNative.restartClient;
    await expect(tdlibClient.restartClient()).rejects.toThrow(/Закройте приложение полностью/);
    mockNative.restartClient = original;
  });
});

describe('TdlibClient.send', () => {
  it('разбирает JSON-ответ нативного модуля', async () => {
    await expect(tdlibClient.send({ '@type': 'getAuthorizationState' })).resolves.toEqual({ '@type': 'ok' });
    expect(mockNative.sendClientJson).toHaveBeenCalledWith('{"@type":"getAuthorizationState"}');
  });
});
