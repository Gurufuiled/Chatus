/**
 * Тесты CallProvider (звонки 1-на-1): сигналинг, жизненный цикл WebRTC, таймауты, защита от гонок.
 * Запуск: npx jest src/contexts/CallContext.test.tsx
 * Расширение .tsx — чтобы раннер `npm test` (tsx) не подхватывал jest-файл.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { CallProvider, DISCONNECT_GRACE_MS, INCOMING_TIMEOUT_MS, useCall } from './CallContext';

/* ───────────── моки внешнего мира ───────────── */

jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('@livekit/react-native-webrtc', () => {
  let trackId = 0;
  const makeTrack = (kind: string) => ({
    kind,
    id: `track-${(trackId += 1)}`,
    enabled: true,
    stop: jest.fn(),
  });
  const makeStream = (withVideo: boolean) => {
    const tracks: ReturnType<typeof makeTrack>[] = [makeTrack('audio')];
    if (withVideo) tracks.push(makeTrack('video'));
    return {
      getTracks: () => tracks,
      getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
      getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
      addTrack: (t: ReturnType<typeof makeTrack>) => tracks.push(t),
      removeTrack: (t: ReturnType<typeof makeTrack>) => {
        const i = tracks.indexOf(t);
        if (i >= 0) tracks.splice(i, 1);
      },
      toURL: () => 'stream://local',
    };
  };

  class FakePeerConnection {
    static instances: FakePeerConnection[] = [];
    connectionState = 'new';
    iceConnectionState = 'new';
    remoteDescription: unknown = null;
    localDescription: { type: string; sdp: string } | null = null;
    closed = false;
    addedCandidates: unknown[] = [];
    onicecandidate: ((e: { candidate?: { toJSON: () => unknown } | null }) => void) | null = null;
    ontrack: unknown = null;
    onconnectionstatechange: (() => void) | null = null;
    oniceconnectionstatechange: (() => void) | null = null;
    config: unknown;
    constructor(cfg: unknown) {
      this.config = cfg;
      FakePeerConnection.instances.push(this);
    }
    addTrack(track: unknown) {
      return { track };
    }
    removeTrack() {}
    async createOffer() {
      return { type: 'offer', sdp: 'OFFER-SDP' };
    }
    async createAnswer() {
      return { type: 'answer', sdp: 'ANSWER-SDP' };
    }
    async setLocalDescription(d: { type: string; sdp: string }) {
      this.localDescription = d;
    }
    async setRemoteDescription(d: unknown) {
      this.remoteDescription = d;
    }
    async addIceCandidate(c: unknown) {
      this.addedCandidates.push(c);
    }
    close() {
      this.closed = true;
    }
    /** Тест: ICE/соединение перешло в состояние. */
    setLink(state: string) {
      this.connectionState = state;
      this.iceConnectionState = state;
      this.onconnectionstatechange?.();
      this.oniceconnectionstatechange?.();
    }
    emitCandidate(json: unknown) {
      this.onicecandidate?.({ candidate: { toJSON: () => json } });
    }
  }

  return {
    RTCPeerConnection: FakePeerConnection,
    RTCIceCandidate: class {
      init: unknown;
      constructor(init: unknown) {
        this.init = init;
      }
    },
    RTCSessionDescription: class {
      type: string;
      sdp: string;
      constructor(init: { type: string; sdp: string }) {
        this.type = init.type;
        this.sdp = init.sdp;
      }
    },
    RTCView: () => null,
    MediaStream: class {},
    MediaStreamTrack: class {},
    mediaDevices: {
      getUserMedia: jest.fn((constraints: { video?: unknown }) =>
        Promise.resolve(makeStream(Boolean(constraints.video))),
      ),
    },
    __FakePeerConnection: FakePeerConnection,
  };
});

jest.mock('../services/SignalingService', () => {
  const listeners = new Set<Record<string, (...args: unknown[]) => unknown>>();
  return {
    SignalingService: {
      connect: jest.fn(),
      disconnect: jest.fn(),
      whenConnected: jest.fn(() => Promise.resolve()),
      addListener: jest.fn((handlers: Record<string, (...args: unknown[]) => unknown>) => {
        listeners.add(handlers);
        return () => listeners.delete(handlers);
      }),
      sendOffer: jest.fn(),
      sendAnswer: jest.fn(),
      sendIceCandidate: jest.fn(),
      sendCallCancel: jest.fn(),
      sendCallDecline: jest.fn(),
      sendCallEnd: jest.fn(),
      sendCallBusy: jest.fn(),
      /** Тест: сервер прислал событие. */
      __emit: async (key: string, ...args: unknown[]) => {
        for (const l of [...listeners]) await l[key]?.(...args);
      },
    },
  };
});

jest.mock('../services/VoicePlayerService', () => ({
  VoicePlayerService: { stop: jest.fn(() => Promise.resolve()) },
}));
jest.mock('../utils/releaseMediaAudioSession', () => ({
  releaseMediaAudioSession: jest.fn(() => Promise.resolve()),
}));
jest.mock('./AuthContext', () => {
  const value = { isAuthenticated: true };
  return { useAuth: () => value };
});
jest.mock('../config', () => ({
  getWebRtcIceServers: () => [],
  resolveAvatarUrl: (url?: string | null) => url ?? null,
}));
jest.mock('../stores/chatStore', () => ({
  chatStore: { getState: () => ({ chats: [] }) },
}));
jest.mock('../icons/telegram', () => ({
  TelegramGlyph: () => null,
  TELEGRAM_CALL_GLYPHS: new Proxy({}, { get: () => ({ d: '', viewBox: '0 0 1 1' }) }),
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  return { useSafeAreaInsets: () => insets };
});
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: { View: require('react-native').View },
    clamp: (v: number, min: number, max: number) => Math.min(max, Math.max(min, v)),
    runOnJS: (fn: unknown) => fn,
    useAnimatedStyle: (fn: () => unknown) => fn(),
    useSharedValue: (initial: unknown) => React.useRef({ value: initial }).current,
    withTiming: (to: unknown) => to,
  };
});
jest.mock('react-native-gesture-handler', () => {
  const chain: unknown = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain, Tap: () => chain, Simultaneous: () => chain, Exclusive: () => chain },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
  };
});

/* ───────────── помощники ───────────── */

type CallApi = ReturnType<typeof useCall>;
const { SignalingService } = require('../services/SignalingService') as {
  SignalingService: Record<string, jest.Mock> & {
    __emit: (key: string, ...args: unknown[]) => Promise<void>;
  };
};
const { __FakePeerConnection: FakePC, mediaDevices } = require('@livekit/react-native-webrtc') as {
  __FakePeerConnection: {
    instances: Array<{
      closed: boolean;
      addedCandidates: unknown[];
      remoteDescription: unknown;
      setLink: (state: string) => void;
      emitCandidate: (json: unknown) => void;
    }>;
  };
  mediaDevices: { getUserMedia: jest.Mock };
};

let api: CallApi;
function Probe() {
  api = useCall();
  return null;
}

const flush = async () => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
};
const advance = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};
const emit = async (key: string, ...args: unknown[]) => {
  await act(async () => {
    await SignalingService.__emit(key, ...args);
    await jest.advanceTimersByTimeAsync(0);
  });
};
const pc = (index = FakePC.instances.length - 1) => FakePC.instances[index];

const SDP = { type: 'offer', sdp: 'REMOTE-OFFER' };
const startAudioCall = async (userId = 'peer-1') => {
  await act(async () => {
    void api.startCall({ userId, displayName: 'Аня', callKind: 'audio' });
    await jest.advanceTimersByTimeAsync(0);
  });
  await flush();
};
const receiveIncoming = async (from = 'peer-1', callType: 'audio' | 'video' = 'audio') => {
  await emit('onOffer', from, SDP, callType);
};

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  FakePC.instances.length = 0;
  Object.values(SignalingService).forEach((fn) => {
    if (jest.isMockFunction(fn)) fn.mockClear();
  });
  mediaDevices.getUserMedia.mockClear();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  render(
    <CallProvider>
      <Probe />
    </CallProvider>,
  );
});

afterEach(() => {
  alertSpy.mockRestore();
  jest.useRealTimers();
});

/* ───────────── исходящий звонок ───────────── */

describe('исходящий звонок', () => {
  it('startCall: ждёт сигналинг, создаёт соединение, отправляет offer с типом звонка', async () => {
    await startAudioCall();
    expect(SignalingService.whenConnected).toHaveBeenCalled();
    expect(FakePC.instances).toHaveLength(1);
    expect(SignalingService.sendOffer).toHaveBeenCalledWith(
      'peer-1',
      { type: 'offer', sdp: 'OFFER-SDP' },
      'audio',
    );
    expect(api.callState?.phase).toBe('outgoing');
    expect(api.callState?.displayName).toBe('Аня');
  });

  it('видеозвонок запрашивает видео и отправляет call_type=video', async () => {
    await act(async () => {
      void api.startCall({ userId: 'peer-1', displayName: 'Аня', callKind: 'video' });
      await jest.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: true, video: expect.anything() }),
    );
    expect(SignalingService.sendOffer.mock.calls[0][2]).toBe('video');
  });

  it('регрессия: двойное нажатие «позвонить» создаёт ровно одно соединение и один offer', async () => {
    await act(async () => {
      void api.startCall({ userId: 'peer-1', displayName: 'Аня' });
      void api.startCall({ userId: 'peer-1', displayName: 'Аня' });
      await jest.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(FakePC.instances).toHaveLength(1);
    expect(SignalingService.sendOffer).toHaveBeenCalledTimes(1);
  });

  it('нельзя начать второй звонок поверх идущего', async () => {
    await startAudioCall('peer-1');
    await act(async () => {
      void api.startCall({ userId: 'peer-2', displayName: 'Боря' });
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(FakePC.instances).toHaveLength(1);
    expect(api.callState?.remoteUserId).toBe('peer-1');
  });

  it('после ошибки (нет доступа к микрофону) состояние чистится и флаг «в процессе» снимается', async () => {
    const { Audio } = require('expo-av') as { Audio: { requestPermissionsAsync: jest.Mock } };
    Audio.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    await startAudioCall();
    expect(api.callState).toBeNull();
    expect(alertSpy).toHaveBeenCalledWith('Не удалось начать звонок', 'Microphone permission denied');

    // после неудачи можно позвонить снова
    await startAudioCall();
    expect(api.callState?.phase).toBe('outgoing');
  });

  it('answer от собеседника → connecting, затем ICE connected → active', async () => {
    await startAudioCall();
    await emit('onAnswer', 'peer-1', { type: 'answer', sdp: 'ANS' });
    expect(api.callState?.phase).toBe('connecting');
    expect(pc().remoteDescription).toMatchObject({ sdp: 'ANS' });

    await act(async () => pc().setLink('connected'));
    expect(api.callState?.phase).toBe('active');
    expect(api.callState?.startedAt).toBeDefined();
  });

  it('answer от постороннего пользователя игнорируется', async () => {
    await startAudioCall('peer-1');
    await emit('onAnswer', 'stranger', { type: 'answer', sdp: 'ANS' });
    expect(api.callState?.phase).toBe('outgoing');
    expect(pc().remoteDescription).toBeNull();
  });

  it('ICE-кандидаты собственного соединения уходят собеседнику', async () => {
    await startAudioCall();
    act(() => pc().emitCandidate({ candidate: 'c1' }));
    expect(SignalingService.sendIceCandidate).toHaveBeenCalledWith('peer-1', { candidate: 'c1' });
  });

  it('регрессия: «нет ответа» через 30 с отменяет вызов и у собеседника (call_cancel)', async () => {
    await startAudioCall();
    await advance(29_999);
    expect(api.callState).not.toBeNull();
    expect(SignalingService.sendCallCancel).not.toHaveBeenCalled();

    await advance(1);
    expect(SignalingService.sendCallCancel).toHaveBeenCalledWith('peer-1');
    expect(api.callState).toBeNull();
    expect(alertSpy).toHaveBeenCalledWith('Нет ответа', 'Аня не ответил на звонок.');
    expect(pc().closed).toBe(true);
  });

  it('таймаут не срабатывает, если собеседник ответил', async () => {
    await startAudioCall();
    await emit('onAnswer', 'peer-1', { type: 'answer', sdp: 'ANS' });
    await advance(60_000);
    expect(SignalingService.sendCallCancel).not.toHaveBeenCalled();
    expect(api.callState).not.toBeNull();
  });
});

/* ───────────── входящий звонок ───────────── */

describe('входящий звонок', () => {
  it('offer → состояние incoming с типом звонка', async () => {
    await receiveIncoming('peer-1', 'video');
    expect(api.callState).toMatchObject({ phase: 'incoming', remoteUserId: 'peer-1', callKind: 'video' });
    expect(FakePC.instances).toHaveLength(0); // соединение создаётся только при ответе
  });

  it('нет call_type → считаем аудиозвонком', async () => {
    await emit('onOffer', 'peer-1', SDP, undefined);
    expect(api.callState?.callKind).toBe('audio');
  });

  it('второй входящий от другого пользователя → ему call_busy, текущий не затронут', async () => {
    await receiveIncoming('peer-1');
    await receiveIncoming('peer-2');
    expect(SignalingService.sendCallBusy).toHaveBeenCalledWith('peer-2');
    expect(api.callState?.remoteUserId).toBe('peer-1');
  });

  it('регрессия: повторный offer от того же звонящего НЕ отвечает ему «занят» и не рвёт звонок', async () => {
    await receiveIncoming('peer-1', 'audio');
    await receiveIncoming('peer-1', 'video'); // повторная доставка / ретрай
    expect(SignalingService.sendCallBusy).not.toHaveBeenCalled();
    expect(api.callState).toMatchObject({ phase: 'incoming', remoteUserId: 'peer-1', callKind: 'video' });
  });

  it('принятие: создаёт соединение, ставит offer, отправляет answer, фаза connecting', async () => {
    await receiveIncoming('peer-1');
    await act(async () => {
      void api.acceptIncomingCall();
      await jest.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(FakePC.instances).toHaveLength(1);
    expect(pc().remoteDescription).toMatchObject({ type: 'offer', sdp: 'REMOTE-OFFER' });
    expect(SignalingService.sendAnswer).toHaveBeenCalledWith('peer-1', {
      type: 'answer',
      sdp: 'ANSWER-SDP',
    });
    expect(api.callState?.phase).toBe('connecting');
  });

  it('регрессия: двойное нажатие «принять» не создаёт второе соединение и второй answer', async () => {
    await receiveIncoming('peer-1');
    await act(async () => {
      void api.acceptIncomingCall();
      void api.acceptIncomingCall();
      await jest.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(FakePC.instances).toHaveLength(1);
    expect(SignalingService.sendAnswer).toHaveBeenCalledTimes(1);
  });

  it('принять можно только входящий: при исходящем acceptIncomingCall ничего не делает', async () => {
    await startAudioCall();
    await act(async () => {
      void api.acceptIncomingCall();
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(SignalingService.sendAnswer).not.toHaveBeenCalled();
  });

  it('ICE-кандидаты, пришедшие до принятия, буферизуются и добавляются после setRemoteDescription', async () => {
    await receiveIncoming('peer-1');
    await emit('onIceCandidate', 'peer-1', { candidate: 'early-1' });
    await emit('onIceCandidate', 'peer-1', { candidate: 'early-2' });
    await act(async () => {
      void api.acceptIncomingCall();
      await jest.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(pc().addedCandidates).toHaveLength(2);
  });

  it('кандидаты от постороннего и пустой кандидат не добавляются', async () => {
    await receiveIncoming('peer-1');
    await emit('onIceCandidate', 'stranger', { candidate: 'x' });
    await emit('onIceCandidate', 'peer-1', null);
    await act(async () => {
      void api.acceptIncomingCall();
      await jest.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(pc().addedCandidates).toHaveLength(0);
  });

  it('отклонение: call_decline и очистка', async () => {
    await receiveIncoming('peer-1');
    await act(async () => {
      await api.declineIncomingCall();
    });
    expect(SignalingService.sendCallDecline).toHaveBeenCalledWith('peer-1');
    expect(api.callState).toBeNull();
  });

  it('звонящий отменил (call_cancel) — входящий исчезает', async () => {
    await receiveIncoming('peer-1');
    await emit('onCallCancel', 'peer-1');
    expect(api.callState).toBeNull();
  });

  it('call_cancel от постороннего ничего не меняет', async () => {
    await receiveIncoming('peer-1');
    await emit('onCallCancel', 'stranger');
    expect(api.callState).not.toBeNull();
  });

  it('регрессия: входящий без ответа 60 с закрывается сам (звонящий мог пропасть без call_cancel)', async () => {
    await receiveIncoming('peer-1');
    await advance(INCOMING_TIMEOUT_MS - 1);
    expect(api.callState?.phase).toBe('incoming');
    await advance(1);
    expect(api.callState).toBeNull();
  });

  it('таймаут входящего не срабатывает после принятия', async () => {
    await receiveIncoming('peer-1');
    await act(async () => {
      void api.acceptIncomingCall();
      await jest.advanceTimersByTimeAsync(0);
    });
    await flush();
    await advance(INCOMING_TIMEOUT_MS * 2);
    expect(api.callState).not.toBeNull();
  });

  it('ошибка при принятии: звонящему уходит decline, состояние чистится, показывается ошибка', async () => {
    const { Audio } = require('expo-av') as { Audio: { requestPermissionsAsync: jest.Mock } };
    Audio.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    await receiveIncoming('peer-1');
    await act(async () => {
      void api.acceptIncomingCall();
      await jest.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(SignalingService.sendCallDecline).toHaveBeenCalledWith('peer-1');
    expect(api.callState).toBeNull();
    expect(alertSpy).toHaveBeenCalledWith('Не удалось принять звонок', 'Microphone permission denied');
  });
});

/* ───────────── завершение звонка ───────────── */

describe('endCall посылает правильное событие в зависимости от фазы', () => {
  it('входящий → decline', async () => {
    await receiveIncoming('peer-1');
    await act(async () => api.endCall());
    expect(SignalingService.sendCallDecline).toHaveBeenCalledWith('peer-1');
    expect(SignalingService.sendCallEnd).not.toHaveBeenCalled();
  });

  it('исходящий (ещё не ответили) → cancel', async () => {
    await startAudioCall();
    await act(async () => api.endCall());
    expect(SignalingService.sendCallCancel).toHaveBeenCalledWith('peer-1');
    expect(api.callState).toBeNull();
    expect(pc().closed).toBe(true);
  });

  it('активный → end', async () => {
    await startAudioCall();
    await emit('onAnswer', 'peer-1', { type: 'answer', sdp: 'A' });
    await act(async () => pc().setLink('connected'));
    await act(async () => api.endCall());
    expect(SignalingService.sendCallEnd).toHaveBeenCalledWith('peer-1');
  });

  it('без звонка endCall ничего не делает', async () => {
    await act(async () => api.endCall());
    expect(SignalingService.sendCallEnd).not.toHaveBeenCalled();
    expect(SignalingService.sendCallCancel).not.toHaveBeenCalled();
  });

  it('остановка локальных дорожек и закрытие соединения', async () => {
    await startAudioCall();
    const stream = await mediaDevices.getUserMedia.mock.results[0].value;
    await act(async () => api.endCall());
    for (const track of stream.getTracks()) expect(track.stop).toHaveBeenCalled();
    expect(pc().closed).toBe(true);
  });
});

describe('события собеседника', () => {
  const activeCall = async () => {
    await startAudioCall();
    await emit('onAnswer', 'peer-1', { type: 'answer', sdp: 'A' });
    await act(async () => pc().setLink('connected'));
  };

  it('call_end → звонок закрыт без ошибки', async () => {
    await activeCall();
    await emit('onCallEnd', 'peer-1');
    expect(api.callState).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('call_decline → закрыт и показано «отклонил»', async () => {
    await startAudioCall();
    await emit('onCallDecline', 'peer-1');
    expect(api.callState).toBeNull();
    expect(alertSpy).toHaveBeenCalledWith('Звонок отклонен', 'Аня отклонил звонок.');
  });

  it('call_busy → закрыт и показано «занят»', async () => {
    await startAudioCall();
    await emit('onCallBusy', 'peer-1');
    expect(api.callState).toBeNull();
    expect(alertSpy).toHaveBeenCalledWith('Пользователь занят', 'Аня уже разговаривает.');
  });

  it('события от постороннего пользователя не трогают звонок', async () => {
    await activeCall();
    await emit('onCallEnd', 'stranger');
    await emit('onCallDecline', 'stranger');
    await emit('onCallBusy', 'stranger');
    expect(api.callState?.phase).toBe('active');
  });

  it('offer от собеседника в активном звонке — это пересогласование (видео), а не новый звонок: отвечаем answer', async () => {
    await activeCall();
    SignalingService.sendAnswer.mockClear();
    await emit('onOffer', 'peer-1', { type: 'offer', sdp: 'RENEGOTIATE' }, 'video');
    expect(SignalingService.sendAnswer).toHaveBeenCalledWith('peer-1', { type: 'answer', sdp: 'ANSWER-SDP' });
    expect(SignalingService.sendCallBusy).not.toHaveBeenCalled();
    expect(api.callState?.phase).toBe('active');
    expect(api.callState?.callKind).toBe('video');
  });
});

/* ───────────── потеря связи ───────────── */

describe('устойчивость соединения', () => {
  const activeCall = async () => {
    await startAudioCall();
    await emit('onAnswer', 'peer-1', { type: 'answer', sdp: 'A' });
    await act(async () => pc().setLink('connected'));
    expect(api.callState?.phase).toBe('active');
  };

  it('регрессия: кратковременное «disconnected» не обрывает звонок сразу', async () => {
    await activeCall();
    await act(async () => pc().setLink('disconnected'));
    expect(api.callState?.phase).toBe('active');
    await advance(DISCONNECT_GRACE_MS - 1);
    expect(api.callState?.phase).toBe('active');
    expect(SignalingService.sendCallEnd).not.toHaveBeenCalled();
  });

  it('связь восстановилась в пределах паузы — звонок продолжается и не обрывается потом', async () => {
    await activeCall();
    await act(async () => pc().setLink('disconnected'));
    await advance(3000);
    await act(async () => pc().setLink('connected'));
    await advance(DISCONNECT_GRACE_MS * 3);
    expect(api.callState?.phase).toBe('active');
    expect(SignalingService.sendCallEnd).not.toHaveBeenCalled();
  });

  it('связь не вернулась за DISCONNECT_GRACE_MS → звонок закрыт и собеседнику уходит call_end', async () => {
    await activeCall();
    await act(async () => pc().setLink('disconnected'));
    await advance(DISCONNECT_GRACE_MS);
    expect(api.callState).toBeNull();
    expect(SignalingService.sendCallEnd).toHaveBeenCalledWith('peer-1');
  });

  it('повторные «disconnected» не перезапускают отсчёт паузы', async () => {
    await activeCall();
    await act(async () => pc().setLink('disconnected'));
    await advance(5000);
    await act(async () => pc().setLink('disconnected'));
    await advance(DISCONNECT_GRACE_MS - 5000);
    expect(api.callState).toBeNull();
  });

  it('«failed» — сразу конец и call_end собеседнику (раньше собеседник узнавал только по своему таймауту)', async () => {
    await activeCall();
    await act(async () => pc().setLink('failed'));
    expect(api.callState).toBeNull();
    expect(SignalingService.sendCallEnd).toHaveBeenCalledWith('peer-1');
  });

  it('регрессия: закрытие СТАРОГО соединения не сбрасывает уже НОВЫЙ звонок (повторный набор сразу после отбоя)', async () => {
    await startAudioCall('peer-1');
    const oldPc = pc();
    await act(async () => api.endCall());
    expect(oldPc.closed).toBe(true);

    await startAudioCall('peer-2'); // сразу перезвонили
    expect(api.callState).toMatchObject({ phase: 'outgoing', remoteUserId: 'peer-2' });
    SignalingService.sendCallEnd.mockClear();

    // «опоздавшее» событие закрытия старого соединения
    await act(async () => oldPc.setLink('closed'));
    expect(api.callState).toMatchObject({ phase: 'outgoing', remoteUserId: 'peer-2' });
    expect(SignalingService.sendCallEnd).not.toHaveBeenCalled();
  });

  it('кандидаты и треки старого соединения после завершения звонка собеседнику не отправляются', async () => {
    await startAudioCall('peer-1');
    const oldPc = pc();
    await act(async () => api.endCall());
    SignalingService.sendIceCandidate.mockClear();
    act(() => oldPc.emitCandidate({ candidate: 'late' }));
    expect(SignalingService.sendIceCandidate).not.toHaveBeenCalled();
  });

  it('таймер паузы сбрасывается при завершении звонка: потом ничего не отправляется', async () => {
    await activeCall();
    await act(async () => pc().setLink('disconnected'));
    await act(async () => api.endCall());
    SignalingService.sendCallEnd.mockClear();
    await advance(DISCONNECT_GRACE_MS * 2);
    expect(SignalingService.sendCallEnd).not.toHaveBeenCalled();
  });
});

/* ───────────── управление звонком ───────────── */

describe('управление', () => {
  it('mute выключает аудиодорожку и обратно', async () => {
    await startAudioCall();
    const stream = await mediaDevices.getUserMedia.mock.results[0].value;
    const [audio] = stream.getAudioTracks();
    expect(api.callState?.isLocalAudioReady).toBe(true);

    act(() => api.toggleMute());
    expect(audio.enabled).toBe(false);
    expect(api.callState?.isMuted).toBe(true);

    act(() => api.toggleMute());
    expect(audio.enabled).toBe(true);
    expect(api.callState?.isMuted).toBe(false);
  });

  it('mute без звонка ничего не делает и не падает', () => {
    expect(() => act(() => api.toggleMute())).not.toThrow();
    expect(api.callState).toBeNull();
  });

  it('включение видео в активном аудиозвонке: захватывает камеру и шлёт новый offer с call_type=video', async () => {
    await startAudioCall();
    await emit('onAnswer', 'peer-1', { type: 'answer', sdp: 'A' });
    await act(async () => pc().setLink('connected'));
    SignalingService.sendOffer.mockClear();

    await act(async () => {
      void api.toggleVideo();
      await jest.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(SignalingService.sendOffer).toHaveBeenCalledWith(
      'peer-1',
      { type: 'offer', sdp: 'OFFER-SDP' },
      'video',
    );
    expect(api.callState?.callKind).toBe('video');
  });
});

/* ───────────── подписка на сигналинг ───────────── */

describe('жизненный цикл провайдера', () => {
  it('подключается к сигналингу при авторизации и подписывается на события', () => {
    expect(SignalingService.connect).toHaveBeenCalled();
    expect(SignalingService.addListener).toHaveBeenCalled();
  });

  it('useCall вне провайдера бросает понятную ошибку', () => {
    function Orphan() {
      useCall();
      return null;
    }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Orphan />)).toThrow('useCall must be used within CallProvider');
    spy.mockRestore();
  });
});
