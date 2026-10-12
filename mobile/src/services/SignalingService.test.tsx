/**
 * Тесты SignalingService (WebRTC-сигналинг звонков).
 * Расширение .tsx — чтобы раннер `npm test` (tsx) не подхватывал jest-файл; запуск:
 *   npx jest src/services/SignalingService.test.tsx
 */

type Handler = ((event: { data: unknown }) => void) | (() => void) | null;

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: Handler = null;
  onclose: Handler = null;
  onerror: Handler = null;
  onmessage: Handler = null;
  closeCalls = 0;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.closeCalls += 1;
    this.readyState = FakeWebSocket.CLOSING;
  }

  /** Сервер открыл соединение. */
  open() {
    this.readyState = FakeWebSocket.OPEN;
    (this.onopen as (() => void) | null)?.();
  }

  /** Сокет закрылся (как после реального close() или обрыва сети). */
  drop() {
    this.readyState = FakeWebSocket.CLOSED;
    (this.onclose as (() => void) | null)?.();
  }

  /** Сообщение от сервера. */
  receive(message: unknown) {
    (this.onmessage as ((e: { data: unknown }) => void) | null)?.({
      data: typeof message === 'string' ? message : JSON.stringify(message),
    });
  }

  sentEvents() {
    return this.sent.map((s) => JSON.parse(s) as { event: string; data: Record<string, unknown> });
  }
}

let mockAccessToken: string | null = "tok-1";

jest.mock('../config', () => ({ getSignalingUrl: () => 'ws://signal.test/ws' }));
jest.mock('../stores/authStore', () => ({
  authStore: { getState: () => ({ accessToken: mockAccessToken }) },
}));

type Service = typeof import('./SignalingService').SignalingService;
let SignalingService: Service;
let CONTROL_QUEUE_TTL_MS: number;

const lastSocket = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-12T12:00:00Z'));
  mockAccessToken = 'tok-1';
  FakeWebSocket.instances = [];
  (global as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  jest.resetModules();
  const mod = require('./SignalingService') as typeof import('./SignalingService');
  SignalingService = mod.SignalingService;
  CONTROL_QUEUE_TTL_MS = mod.CONTROL_QUEUE_TTL_MS;
});

afterEach(() => {
  SignalingService.disconnect();
  jest.useRealTimers();
});

describe('подключение', () => {
  it('открывает сокет с токеном в адресе', () => {
    SignalingService.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(lastSocket().url).toBe('ws://signal.test/ws?token=tok-1');
  });

  it('без токена сокет не открывается, а об ошибке сообщается', () => {
    mockAccessToken = null;
    const onError = jest.fn();
    SignalingService.setHandlers({ onError });
    SignalingService.connect();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('повторный connect() при открытом или подключающемся сокете не создаёт второй', () => {
    SignalingService.connect();
    SignalingService.connect();
    lastSocket().open();
    SignalingService.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('whenConnected() резолвится, когда сокет открылся', async () => {
    SignalingService.connect();
    const promise = SignalingService.whenConnected();
    lastSocket().open();
    await expect(promise).resolves.toBeUndefined();
    expect(SignalingService.isConnected()).toBe(true);
  });

  it('whenConnected() падает по таймауту, если сокет так и не открылся', async () => {
    SignalingService.connect();
    const promise = SignalingService.whenConnected(1000);
    const assertion = expect(promise).rejects.toThrow('Signaling connection timeout');
    jest.advanceTimersByTime(1000);
    await assertion;
  });

  it('whenConnected() сам запускает connect(), если сокета нет', () => {
    void SignalingService.whenConnected(500).catch(() => undefined);
    expect(FakeWebSocket.instances).toHaveLength(1);
    jest.advanceTimersByTime(500);
  });
});

describe('поздний onclose старого сокета (регрессия: «потерянный» новый сокет)', () => {
  it('disconnect() + connect(): закрытие старого сокета не обнуляет новый', async () => {
    SignalingService.connect();
    const oldSocket = lastSocket();
    oldSocket.open();

    SignalingService.disconnect();
    SignalingService.connect();
    const newSocket = lastSocket();
    expect(newSocket).not.toBe(oldSocket);
    newSocket.open();

    // старый сокет «доезжает» с onclose уже после создания нового
    oldSocket.drop();

    expect(SignalingService.isConnected()).toBe(true);
    await expect(SignalingService.whenConnected()).resolves.toBeUndefined();
    // и не плодит лишних подключений
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('закрытие старого сокета не запускает переподключение, пока жив новый', () => {
    SignalingService.connect();
    const oldSocket = lastSocket();
    oldSocket.open();
    SignalingService.disconnect();
    SignalingService.connect();
    lastSocket().open();

    oldSocket.drop();
    jest.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('сообщения старого сокета игнорируются', () => {
    const onCallEnd = jest.fn();
    SignalingService.addListener({ onCallEnd });
    SignalingService.connect();
    const oldSocket = lastSocket();
    oldSocket.open();
    SignalingService.disconnect();
    SignalingService.connect();
    lastSocket().open();

    oldSocket.receive({ type: 'call_end', from_user_id: 'u1' });
    expect(onCallEnd).not.toHaveBeenCalled();

    lastSocket().receive({ type: 'call_end', from_user_id: 'u1' });
    expect(onCallEnd).toHaveBeenCalledWith('u1');
  });

  it('но подписчики на закрытие сокета всё равно уведомляются о старом сокете', () => {
    const onClose = jest.fn();
    SignalingService.addSocketCloseListener(onClose);
    SignalingService.connect();
    const oldSocket = lastSocket();
    oldSocket.open();
    SignalingService.disconnect();
    oldSocket.drop();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('переподключение', () => {
  it('после обрыва переподключается с нарастающей паузой 1с → 2с → 4с', () => {
    SignalingService.connect();
    lastSocket().open();

    lastSocket().drop();
    jest.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    lastSocket().drop(); // не успел открыться
    jest.advanceTimersByTime(1999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);

    lastSocket().drop();
    jest.advanceTimersByTime(4000);
    expect(FakeWebSocket.instances).toHaveLength(4);
  });

  it('пауза не превышает 30 секунд', () => {
    SignalingService.connect();
    for (let i = 0; i < 8; i += 1) {
      lastSocket().drop();
      jest.advanceTimersByTime(30_000);
    }
    const before = FakeWebSocket.instances.length;
    lastSocket().drop();
    jest.advanceTimersByTime(30_000);
    expect(FakeWebSocket.instances).toHaveLength(before + 1);
  });

  it('успешное открытие сбрасывает счётчик пауз', () => {
    SignalingService.connect();
    lastSocket().drop();
    jest.advanceTimersByTime(1000);
    lastSocket().drop();
    jest.advanceTimersByTime(2000);
    lastSocket().open(); // дошли — счётчик в ноль
    lastSocket().drop();
    jest.advanceTimersByTime(999);
    const count = FakeWebSocket.instances.length;
    jest.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(count + 1);
  });

  it('после явного disconnect() переподключения нет', () => {
    SignalingService.connect();
    const socket = lastSocket();
    socket.open();
    SignalingService.disconnect();
    socket.drop();
    jest.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('без токена после обрыва переподключения нет', () => {
    SignalingService.connect();
    lastSocket().open();
    mockAccessToken = null;
    lastSocket().drop();
    jest.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('reconnect() заменяет сокет и уведомляет об обрыве старого', () => {
    const onClose = jest.fn();
    SignalingService.addSocketCloseListener(onClose);
    SignalingService.connect();
    const first = lastSocket();
    first.open();
    SignalingService.reconnect();
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(first.closeCalls).toBe(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('изоляция слушателей (регрессия: исключение одного ломало остальных)', () => {
  it('исключение в одном слушателе не мешает другим получить событие', () => {
    const onError = jest.fn();
    SignalingService.setHandlers({ onError });
    const second = jest.fn();
    SignalingService.addListener({
      onCallEnd: () => {
        throw new Error('boom');
      },
    });
    SignalingService.addListener({ onCallEnd: second });
    SignalingService.connect();
    lastSocket().open();

    expect(() => lastSocket().receive({ type: 'call_end', from_user_id: 'u1' })).not.toThrow();
    expect(second).toHaveBeenCalledWith('u1');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('отклонённый промис асинхронного слушателя уходит в onError, а не в unhandled rejection', async () => {
    const onError = jest.fn();
    SignalingService.setHandlers({ onError });
    SignalingService.addListener({
      onCallCancel: async () => {
        throw new Error('async boom');
      },
    });
    SignalingService.connect();
    lastSocket().open();

    lastSocket().receive({ type: 'call_cancel', from_user_id: 'u1' });
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe('async boom');
  });

  it('отписка работает', () => {
    const handler = jest.fn();
    const unsubscribe = SignalingService.addListener({ onCallEnd: handler });
    SignalingService.connect();
    lastSocket().open();
    unsubscribe();
    lastSocket().receive({ type: 'call_end', from_user_id: 'u1' });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('входящие сообщения', () => {
  const setup = () => {
    const handlers = {
      onOffer: jest.fn(),
      onAnswer: jest.fn(),
      onIceCandidate: jest.fn(),
      onCallCancel: jest.fn(),
      onCallDecline: jest.fn(),
      onCallEnd: jest.fn(),
      onCallBusy: jest.fn(),
      onError: jest.fn(),
    };
    SignalingService.addListener(handlers);
    SignalingService.connect();
    lastSocket().open();
    return handlers;
  };

  it('offer со строковым sdp → { type: "offer", sdp } и тип звонка', () => {
    const h = setup();
    lastSocket().receive({ type: 'offer', from_user_id: 'u1', offer: 'SDP', call_type: 'video' });
    expect(h.onOffer).toHaveBeenCalledWith('u1', { type: 'offer', sdp: 'SDP' }, 'video');
  });

  it('offer с объектом sdp и без call_type', () => {
    const h = setup();
    lastSocket().receive({
      type: 'offer',
      from_user_id: 'u1',
      sdp: { type: 'offer', sdp: 'S2' },
    });
    expect(h.onOffer).toHaveBeenCalledWith('u1', { type: 'offer', sdp: 'S2' }, undefined);
  });

  it('offer без отправителя или без sdp игнорируется', () => {
    const h = setup();
    lastSocket().receive({ type: 'offer', offer: 'SDP' });
    lastSocket().receive({ type: 'offer', from_user_id: 'u1' });
    expect(h.onOffer).not.toHaveBeenCalled();
  });

  it('answer', () => {
    const h = setup();
    lastSocket().receive({ type: 'answer', from_user_id: 'u2', answer: 'ANS' });
    expect(h.onAnswer).toHaveBeenCalledWith('u2', { type: 'answer', sdp: 'ANS' });
  });

  it('ice и ice_candidate; пустой кандидат превращается в null', () => {
    const h = setup();
    lastSocket().receive({ type: 'ice', from_user_id: 'u1', candidate: { candidate: 'c1' } });
    lastSocket().receive({ type: 'ice_candidate', from_user_id: 'u1' });
    expect(h.onIceCandidate).toHaveBeenNthCalledWith(1, 'u1', { candidate: 'c1' });
    expect(h.onIceCandidate).toHaveBeenNthCalledWith(2, 'u1', null);
  });

  it.each([
    ['call_cancel', 'onCallCancel'],
    ['call_decline', 'onCallDecline'],
    ['call_end', 'onCallEnd'],
    ['call_busy', 'onCallBusy'],
  ] as const)('%s → %s', (type, handler) => {
    const h = setup();
    lastSocket().receive({ type, from_user_id: 'u9' });
    expect(h[handler]).toHaveBeenCalledWith('u9');
    // без отправителя событие не доставляется
    h[handler].mockClear();
    lastSocket().receive({ type });
    expect(h[handler]).not.toHaveBeenCalled();
  });

  it('error → onError с текстом сообщения', () => {
    const h = setup();
    lastSocket().receive({ type: 'error', message: 'нет прав' });
    expect(h.onError).toHaveBeenCalledWith('нет прав');
  });

  it('битый JSON, неизвестный тип и пустой type игнорируются', () => {
    const h = setup();
    lastSocket().receive('{not json');
    lastSocket().receive({ type: 'something_else', from_user_id: 'u1' });
    lastSocket().receive({ from_user_id: 'u1' });
    for (const fn of Object.values(h)) expect(fn).not.toHaveBeenCalled();
  });

  it('dm_* и line_sync* раскладываются по своим «сырым» слушателям, а не по звонковым', () => {
    const h = setup();
    const dm = jest.fn();
    const lineSync = jest.fn();
    const dc = jest.fn();
    SignalingService.addPeerDeliveryRawListener(dm);
    SignalingService.addLineSyncRawListener(lineSync);
    SignalingService.addLineSyncDataChannelRawListener(dc);

    lastSocket().receive({ type: 'dm_deliver', from_user_id: 'u1' });
    lastSocket().receive({ type: 'line_sync', from_user_id: 'u1' });
    lastSocket().receive({ type: 'line_sync_dc_ice', from_user_id: 'u1' });

    expect(dm).toHaveBeenCalledTimes(1);
    expect(lineSync).toHaveBeenCalledTimes(1);
    expect(dc).toHaveBeenCalledTimes(1);
    expect(h.onOffer).not.toHaveBeenCalled();
  });
});

describe('исходящие события', () => {
  it('формат offer/answer/ice', () => {
    SignalingService.connect();
    lastSocket().open();
    SignalingService.sendOffer('u1', { type: 'offer', sdp: 'S' }, 'video');
    SignalingService.sendAnswer('u1', { type: 'answer', sdp: 'A' });
    SignalingService.sendIceCandidate('u1', { candidate: 'c' });
    SignalingService.sendIceCandidate('u1', null);

    const [offer, answer, ice, endOfCandidates] = lastSocket().sentEvents();
    expect(offer).toEqual({
      event: 'offer',
      data: { target_user_id: 'u1', call_type: 'video', offer: { type: 'offer', sdp: 'S' } },
    });
    expect(answer).toEqual({
      event: 'answer',
      data: { target_user_id: 'u1', answer: { type: 'answer', sdp: 'A' } },
    });
    expect(ice.data.candidate).toEqual({ candidate: 'c' });
    expect(endOfCandidates.data.candidate).toBeNull();
  });

  it('тип звонка по умолчанию — audio', () => {
    SignalingService.connect();
    lastSocket().open();
    SignalingService.sendOffer('u1', { type: 'offer', sdp: 'S' });
    expect(lastSocket().sentEvents()[0].data.call_type).toBe('audio');
  });

  it('call_cancel / decline / end / busy', () => {
    SignalingService.connect();
    lastSocket().open();
    SignalingService.sendCallCancel('u1');
    SignalingService.sendCallDecline('u1');
    SignalingService.sendCallEnd('u1');
    SignalingService.sendCallBusy('u1');
    expect(lastSocket().sentEvents().map((e) => e.event)).toEqual([
      'call_cancel',
      'call_decline',
      'call_end',
      'call_busy',
    ]);
  });
});

describe('управляющие события при закрытом сокете (регрессия: «отбой» терялся)', () => {
  it('call_end, отправленный при обрыве, уходит сразу после переподключения', () => {
    SignalingService.connect();
    lastSocket().open();
    lastSocket().drop(); // связь пропала

    SignalingService.sendCallEnd('u1');
    jest.advanceTimersByTime(1000); // сработало переподключение
    expect(lastSocket().sent).toHaveLength(0); // ещё не открыт
    lastSocket().open();

    expect(lastSocket().sentEvents()).toEqual([
      { event: 'call_end', data: { target_user_id: 'u1' } },
    ]);
  });

  it('все четыре управляющих события откладываются, в исходном порядке', () => {
    SignalingService.sendCallCancel('u1');
    SignalingService.sendCallDecline('u2');
    SignalingService.sendCallEnd('u3');
    SignalingService.sendCallBusy('u4');
    SignalingService.connect();
    lastSocket().open();
    expect(lastSocket().sentEvents().map((e) => [e.event, e.data.target_user_id])).toEqual([
      ['call_cancel', 'u1'],
      ['call_decline', 'u2'],
      ['call_end', 'u3'],
      ['call_busy', 'u4'],
    ]);
  });

  it('ice и offer при закрытом сокете НЕ откладываются (они устаревают за секунды)', () => {
    SignalingService.sendIceCandidate('u1', { candidate: 'c' });
    SignalingService.sendOffer('u1', { type: 'offer', sdp: 'S' });
    SignalingService.connect();
    lastSocket().open();
    expect(lastSocket().sent).toHaveLength(0);
  });

  it('просроченное событие не отправляется', () => {
    SignalingService.sendCallEnd('u1');
    jest.advanceTimersByTime(CONTROL_QUEUE_TTL_MS + 1);
    SignalingService.connect();
    lastSocket().open();
    expect(lastSocket().sent).toHaveLength(0);
  });

  it('очередь ограничена: при переполнении выпадают самые старые', () => {
    for (let i = 0; i < 12; i += 1) SignalingService.sendCallEnd(`u${i}`);
    SignalingService.connect();
    lastSocket().open();
    const targets = lastSocket().sentEvents().map((e) => e.data.target_user_id);
    expect(targets).toHaveLength(8);
    expect(targets[0]).toBe('u4');
    expect(targets[7]).toBe('u11');
  });

  it('очередь не отправляется дважды при следующем переподключении', () => {
    SignalingService.sendCallEnd('u1');
    SignalingService.connect();
    lastSocket().open();
    expect(lastSocket().sent).toHaveLength(1);
    lastSocket().drop();
    jest.advanceTimersByTime(1000);
    lastSocket().open();
    expect(lastSocket().sent).toHaveLength(0);
  });

  it('disconnect() (выход из аккаунта) очищает очередь — чужие события не уйдут новому пользователю', () => {
    SignalingService.sendCallEnd('u1');
    SignalingService.disconnect();
    SignalingService.connect();
    lastSocket().open();
    expect(lastSocket().sent).toHaveLength(0);
  });

  it('если сокет открыт — отправка сразу и без очереди', () => {
    SignalingService.connect();
    lastSocket().open();
    SignalingService.sendCallEnd('u1');
    expect(lastSocket().sent).toHaveLength(1);
  });
});
