/**
 * Выход из Telegram: после logOut клиент TDLib закрывается, поэтому стор пересоздаёт его,
 * иначе войти заново без перезапуска приложения нельзя.
 * Запуск: npx jest src/stores/telegramAccountStore.reset.test.tsx
 */
const mockSend = jest.fn((_query: Record<string, unknown>) => Promise.resolve({ '@type': 'ok' }));
const mockRecover = jest.fn((_options?: Record<string, unknown>) => Promise.resolve({ action: 'restarted' }));

jest.mock('../services/tdlib/TdlibClient', () => ({
  tdlibClient: { send: (query: Record<string, unknown>) => mockSend(query) },
}));
jest.mock('../services/tdlib/tdlibBootstrap', () => ({
  recoverTdlibAuthSession: (options?: Record<string, unknown>) => mockRecover(options),
}));
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('../services/pushNotificationsService', () => ({
  resetTelegramPushRegistrationFlag: jest.fn(),
}));

import { telegramAccountStore } from './telegramAccountStore';

beforeEach(() => {
  mockSend.mockClear();
  mockRecover.mockClear();
  mockSend.mockImplementation(() => Promise.resolve({ '@type': 'ok' }));
  mockRecover.mockImplementation(() => Promise.resolve({ action: 'restarted' }));
  telegramAccountStore.setState({ authStatus: 'ready', phoneNumberHint: '+79880000000' });
});

describe('resetTelegramSession', () => {
  it('шлёт logOut, чистит стор и пересоздаёт клиента TDLib', async () => {
    await telegramAccountStore.getState().resetTelegramSession();

    expect(mockSend).toHaveBeenCalledWith({ '@type': 'logOut' });
    expect(telegramAccountStore.getState().authStatus).not.toBe('ready');
    expect(telegramAccountStore.getState().phoneNumberHint).toBeNull();
    // сразу после logOut клиент ещё "живой" — говорим восстановлению, что он уходит
    expect(mockRecover).toHaveBeenCalledWith({ assumeState: 'authorizationStateLoggingOut' });
  });

  it('если logOut не прошёл (нет нативного TDLib), локальная сессия всё равно сбрасывается', async () => {
    mockSend.mockImplementation(() => Promise.reject(new Error('native unavailable')));
    await telegramAccountStore.getState().resetTelegramSession();
    expect(telegramAccountStore.getState().authStatus).not.toBe('ready');
    expect(mockRecover).toHaveBeenCalledTimes(1);
  });

  it('ошибка восстановления не ломает выход (экран входа повторит его сам)', async () => {
    mockRecover.mockImplementation(() => Promise.reject(new Error('не закрылся')));
    await expect(telegramAccountStore.getState().resetTelegramSession()).resolves.toBeUndefined();
    await Promise.resolve();
  });
});
