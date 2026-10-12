/**
 * Тесты API группового звонка. Запуск: npx jest src/services/groupCallService.test.tsx
 * (.tsx — чтобы раннер `npm test` на tsx не подхватывал jest-файл)
 */
import {
  createGroupCall,
  endGroupCallForAll,
  fetchActiveGroupCall,
  isGroupCallUnavailableError,
  joinGroupCall,
  leaveGroupCall,
} from './groupCallService';

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
jest.mock('./apiClient', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

const response = (status: number, body: string) =>
  ({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) }) as Response;

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiPost.mockReset();
});

describe('isGroupCallUnavailableError', () => {
  it.each([
    'Group call not found',
    'Call already ended',
    'Звонок не найден',
    'Failed (404)',
    'NOT FOUND',
  ])('«%s» → звонок недоступен', (message) => {
    expect(isGroupCallUnavailableError(message)).toBe(true);
  });

  it.each(['Network request failed', 'Forbidden', '500', ''])(
    '«%s» → это не «звонок завершён»',
    (message) => {
      expect(isGroupCallUnavailableError(message)).toBe(false);
    },
  );
});

describe('fetchActiveGroupCall', () => {
  it('возвращает комнату', async () => {
    mockApiGet.mockResolvedValue(response(200, JSON.stringify({ id: 'r1', chat_id: 'c1' })));
    await expect(fetchActiveGroupCall('c1')).resolves.toMatchObject({ id: 'r1' });
    expect(mockApiGet).toHaveBeenCalledWith('/chats/c1/group-calls/active');
  });

  it('пустое тело и null → нет активного звонка', async () => {
    mockApiGet.mockResolvedValueOnce(response(200, ''));
    await expect(fetchActiveGroupCall('c1')).resolves.toBeNull();
    mockApiGet.mockResolvedValueOnce(response(200, 'null'));
    await expect(fetchActiveGroupCall('c1')).resolves.toBeNull();
  });

  it('ошибка сервера: берёт message из JSON', async () => {
    mockApiGet.mockResolvedValue(response(403, JSON.stringify({ message: 'Нет доступа' })));
    await expect(fetchActiveGroupCall('c1')).rejects.toThrow('Нет доступа');
  });

  it('message-массив склеивается через запятую', async () => {
    mockApiGet.mockResolvedValue(response(400, JSON.stringify({ message: ['a', 'b'] })));
    await expect(fetchActiveGroupCall('c1')).rejects.toThrow('a, b');
  });

  it('тело ошибки — не JSON: возвращается как текст', async () => {
    mockApiGet.mockResolvedValue(response(502, 'Bad gateway'));
    await expect(fetchActiveGroupCall('c1')).rejects.toThrow('Bad gateway');
  });

  it('пустое тело ошибки: запасной текст со статусом', async () => {
    mockApiGet.mockResolvedValue(response(500, '   '));
    await expect(fetchActiveGroupCall('c1')).rejects.toThrow(
      'Failed to load active group call (500)',
    );
  });

  it('битый JSON в успешном ответе: понятная ошибка', async () => {
    mockApiGet.mockResolvedValue(response(200, '{oops'));
    await expect(fetchActiveGroupCall('c1')).rejects.toThrow('Некорректный ответ сервера');
  });
});

describe('createGroupCall / joinGroupCall', () => {
  it('create: возвращает комнату и токен', async () => {
    const body = { room: { id: 'r1' }, token: 't', livekit_url: 'wss://x', room_name: 'n' };
    mockApiPost.mockResolvedValue(response(201, JSON.stringify(body)));
    await expect(createGroupCall('c1')).resolves.toEqual(body);
    expect(mockApiPost).toHaveBeenCalledWith('/chats/c1/group-calls');
  });

  it('create: пустой ответ — ошибка', async () => {
    mockApiPost.mockResolvedValue(response(201, ''));
    await expect(createGroupCall('c1')).rejects.toThrow('Пустой ответ сервера при создании звонка');
  });

  it('create: ошибка сервера с message', async () => {
    mockApiPost.mockResolvedValue(response(403, JSON.stringify({ message: 'Только админ' })));
    await expect(createGroupCall('c1')).rejects.toThrow('Только админ');
  });

  it('join: возвращает данные подключения', async () => {
    const body = { token: 't', livekit_url: 'wss://x', room_name: 'n', room: { id: 'r1' } };
    mockApiPost.mockResolvedValue(response(200, JSON.stringify(body)));
    await expect(joinGroupCall('r1')).resolves.toEqual(body);
    expect(mockApiPost).toHaveBeenCalledWith('/group-calls/r1/join');
  });

  it('join: пустой ответ — ошибка', async () => {
    mockApiPost.mockResolvedValue(response(200, ''));
    await expect(joinGroupCall('r1')).rejects.toThrow(
      'Пустой ответ сервера при подключении к звонку',
    );
  });

  it('join: 404 распознаётся как «звонок недоступен»', async () => {
    mockApiPost.mockResolvedValue(
      response(404, JSON.stringify({ message: 'Group call not found' })),
    );
    const error = await joinGroupCall('r1').catch((e: Error) => e);
    expect(isGroupCallUnavailableError((error as Error).message)).toBe(true);
  });
});

describe('leaveGroupCall / endGroupCallForAll', () => {
  it('leave: успех без тела', async () => {
    mockApiPost.mockResolvedValue(response(200, ''));
    await expect(leaveGroupCall('r1')).resolves.toBeUndefined();
    expect(mockApiPost).toHaveBeenCalledWith('/group-calls/r1/leave');
  });

  it('leave: ошибка', async () => {
    mockApiPost.mockResolvedValue(response(500, ''));
    await expect(leaveGroupCall('r1')).rejects.toThrow('Failed to leave group call (500)');
  });

  it('end: успех', async () => {
    mockApiPost.mockResolvedValue(response(200, ''));
    await expect(endGroupCallForAll('r1')).resolves.toBeUndefined();
    expect(mockApiPost).toHaveBeenCalledWith('/group-calls/r1/end');
  });

  it('end: нет прав', async () => {
    mockApiPost.mockResolvedValue(response(403, JSON.stringify({ message: 'Forbidden' })));
    await expect(endGroupCallForAll('r1')).rejects.toThrow('Forbidden');
  });
});
