/**
 * Восстановление сессии при запуске. Регрессия: при блокировке сети обновление токена висело минутами (белый экран),
 * а потом падало и стирало сессию — пользователя выкидывало на экран входа.
 */
const mockSession = {
  get: jest.fn(),
  update: jest.fn(),
  clear: jest.fn(),
};
const mockUserRow = {
  id: 'u1',
  loginus_id: null,
  username: null,
  handle: null,
  display_name: 'Тест',
  avatar_url: null,
  phone: null,
  is_online: 0,
  last_seen: null,
  created_at: 1,
  updated_at: 1,
};

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('../config', () => ({ API_BASE_URL: 'https://api.test/api' }));
jest.mock('./DatabaseService', () => ({ initDatabase: jest.fn() }));
jest.mock('../db/dao/AuthSessionDao', () => ({ AuthSessionDao: jest.fn(() => mockSession) }));
jest.mock('../db/dao/SyncQueueDao', () => ({ SyncQueueDao: jest.fn(() => ({})) }));
jest.mock('../db/dao/UserDao', () => ({ UserDao: jest.fn(() => ({ getById: jest.fn(async () => mockUserRow) })) }));

const {
  AuthService,
  RefreshRejectedError,
  REFRESH_TOKEN_TIMEOUT_MS,
  shouldClearSessionAfterRefreshError,
} = require('./AuthService') as typeof import('./AuthService');

const expiredSession = {
  user_id: 'u1',
  access_token: 'old-access',
  refresh_token: 'refresh',
  expires_at: Date.now() - 60_000,
};

describe('AuthService.restoreSession', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.get.mockResolvedValue(expiredSession);
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('сеть недоступна — сессия остаётся, вход по сохранённым данным', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as never;
    const result = await new AuthService().restoreSession();
    expect(result?.user.id).toBe('u1');
    expect(result?.accessToken).toBe('old-access');
    expect(mockSession.clear).not.toHaveBeenCalled();
  });

  it('сервер отвечает 5xx — сессия остаётся', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }) as never;
    const result = await new AuthService().restoreSession();
    expect(result).not.toBeNull();
    expect(mockSession.clear).not.toHaveBeenCalled();
  });

  it('сервер отклонил токен (401) — сессия стирается', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: 'bad' }) }) as never;
    const result = await new AuthService().restoreSession();
    expect(result).toBeNull();
    expect(mockSession.clear).toHaveBeenCalled();
  });

  it('запрос обновления ограничен по времени', async () => {
    jest.useFakeTimers();
    try {
      let aborted = false;
      global.fetch = jest.fn((_url: string, init?: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          });
        });
      }) as never;
      const pending = new AuthService().restoreSession();
      await jest.advanceTimersByTimeAsync(REFRESH_TOKEN_TIMEOUT_MS + 10);
      const result = await pending;
      expect(aborted).toBe(true);
      expect(result?.accessToken).toBe('old-access');
      expect(mockSession.clear).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('токен ещё действителен — сеть не нужна', async () => {
    mockSession.get.mockResolvedValue({ ...expiredSession, expires_at: Date.now() + 3_600_000 });
    global.fetch = jest.fn() as never;
    const result = await new AuthService().restoreSession();
    expect(result?.accessToken).toBe('old-access');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('shouldClearSessionAfterRefreshError', () => {
  it('стираем только при явном отказе', () => {
    expect(shouldClearSessionAfterRefreshError(new RefreshRejectedError('x'))).toBe(true);
    expect(shouldClearSessionAfterRefreshError(new Error('No refresh token'))).toBe(true);
    expect(shouldClearSessionAfterRefreshError(new TypeError('Network request failed'))).toBe(false);
    expect(shouldClearSessionAfterRefreshError(Object.assign(new Error('Aborted'), { name: 'AbortError' }))).toBe(false);
    expect(shouldClearSessionAfterRefreshError('строка')).toBe(false);
  });
});
