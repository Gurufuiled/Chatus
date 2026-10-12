/**
 * Тесты GroupCallProvider (групповые голосовые чаты на LiveKit).
 * Запуск: npx jest src/contexts/GroupCallContext.test.tsx
 * Расширение .tsx — чтобы раннер `npm test` (tsx) не подхватывал jest-файл.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { GroupCallProvider, useGroupCall } from './GroupCallContext';

/* ───────────── моки ───────────── */

jest.mock('livekit-client', () => {
  class FakeRoom {
    static instances: FakeRoom[] = [];
    static failNextConnect: Error | null = null;
    state = 'disconnected';
    listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    remoteParticipants = new Map<string, unknown>();
    localParticipant = {
      identity: 'me',
      isLocal: true,
      isSpeaking: false,
      getTrackPublication: () => undefined,
      setMicrophoneEnabled: jest.fn(() => Promise.resolve()),
      setCameraEnabled: jest.fn(() => Promise.resolve()),
    };
    connect = jest.fn(async () => {
      if (FakeRoom.failNextConnect) {
        const error = FakeRoom.failNextConnect;
        FakeRoom.failNextConnect = null;
        throw error;
      }
      this.state = 'connected';
    });
    disconnect = jest.fn(async () => {
      this.state = 'disconnected';
    });
    startAudio = jest.fn(() => Promise.resolve());
    constructor() {
      FakeRoom.instances.push(this);
    }
    on(event: string, fn: (...args: unknown[]) => void) {
      const list = this.listeners.get(event) ?? [];
      list.push(fn);
      this.listeners.set(event, list);
      return this;
    }
    removeAllListeners() {
      this.listeners.clear();
    }
    /** Тест: событие от LiveKit. */
    emit(event: string, ...args: unknown[]) {
      (this.listeners.get(event) ?? []).forEach((fn) => fn(...args));
    }
  }
  return {
    Room: FakeRoom,
    RoomEvent: {
      ParticipantConnected: 'participantConnected',
      ParticipantDisconnected: 'participantDisconnected',
      TrackMuted: 'trackMuted',
      TrackUnmuted: 'trackUnmuted',
      TrackPublished: 'trackPublished',
      TrackSubscribed: 'trackSubscribed',
      TrackUnpublished: 'trackUnpublished',
      TrackUnsubscribed: 'trackUnsubscribed',
      ActiveSpeakersChanged: 'activeSpeakersChanged',
      ConnectionStateChanged: 'connectionStateChanged',
      Disconnected: 'disconnected',
    },
    ConnectionState: {
      Connected: 'connected',
      Disconnected: 'disconnected',
      Connecting: 'connecting',
      Reconnecting: 'reconnecting',
    },
    Track: {
      Source: { Camera: 'camera', ScreenShare: 'screen_share', Microphone: 'microphone' },
      Kind: { Video: 'video', Audio: 'audio' },
    },
  };
});
jest.mock('@livekit/react-native', () => ({
  AudioSession: {
    configureAudio: jest.fn(() => Promise.resolve()),
    startAudioSession: jest.fn(() => Promise.resolve()),
    stopAudioSession: jest.fn(() => Promise.resolve()),
    selectAudioOutput: jest.fn(() => Promise.resolve()),
  },
  AndroidAudioTypePresets: { communication: {} },
}));
jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('expo-camera', () => ({
  Camera: { requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })) },
}));
jest.mock('../stores/authStore', () => ({
  authStore: { getState: () => ({ user: { id: 'me', display_name: 'Я' } }) },
}));
jest.mock('../config', () => ({ resolveAvatarUrl: (u?: string | null) => u ?? null }));

const mockCallState: { value: unknown } = { value: null };
jest.mock('./CallContext', () => ({ useCall: () => ({ callState: mockCallState.value }) }));
jest.mock('../components/group-call/GroupCallOverlay', () => ({ GroupCallOverlay: () => null }));
jest.mock('../utils/releaseMediaAudioSession', () => ({
  releaseMediaAudioSession: jest.fn(() => Promise.resolve()),
}));

const mockWsHandlers: { current: Record<string, (payload: Record<string, unknown>) => void> } = {
  current: {},
};
jest.mock('../services/WebSocketService', () => ({
  WebSocketService: {
    setHandlers: (handlers: Record<string, (payload: Record<string, unknown>) => void>) => {
      mockWsHandlers.current = { ...mockWsHandlers.current, ...handlers };
    },
  },
}));

jest.mock('../services/groupCallService', () => ({
  createGroupCall: jest.fn(),
  joinGroupCall: jest.fn(),
  leaveGroupCall: jest.fn(() => Promise.resolve()),
  endGroupCallForAll: jest.fn(() => Promise.resolve()),
  fetchActiveGroupCall: jest.fn(() => Promise.resolve(null)),
  isGroupCallUnavailableError: (message: string) => /not found|already ended|\(404\)/i.test(message),
}));

/* ───────────── помощники ───────────── */

const service = require('../services/groupCallService') as Record<string, jest.Mock>;
const livekit = require('livekit-client') as {
  Room: {
    instances: Array<{
      state: string;
      connect: jest.Mock;
      disconnect: jest.Mock;
      localParticipant: { setMicrophoneEnabled: jest.Mock };
      emit: (event: string, ...args: unknown[]) => void;
    }>;
    failNextConnect: Error | null;
  };
};
const { Camera } = require('expo-camera') as { Camera: { requestCameraPermissionsAsync: jest.Mock } };

type Api = ReturnType<typeof useGroupCall>;
let api: Api;
function Probe() {
  api = useGroupCall();
  return null;
}

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });
};
const room = () => livekit.Room.instances[livekit.Room.instances.length - 1];

const apiRoom = (id = 'room-1', chatId = 'chat-1') => ({
  id,
  chat_id: chatId,
  livekit_room_name: `lk-${id}`,
  started_by_user_id: 'me',
  started_at: 1_760_000_000_000,
  participant_count: 1,
});
const createResponse = (id = 'room-1') => ({
  room: apiRoom(id),
  token: 'tok',
  livekit_url: 'wss://lk.test',
  room_name: `lk-${id}`,
});

const startCall = async (chatId = 'chat-1') => {
  await act(async () => {
    void api.startGroupCall(chatId, 'Чат');
  });
  await flush();
};
const joinCall = async (roomId = 'room-1', chatId = 'chat-1') => {
  await act(async () => {
    void api.joinGroupCall(roomId, chatId, 'Чат');
  });
  await flush();
};

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  livekit.Room.instances.length = 0;
  livekit.Room.failNextConnect = null;
  mockCallState.value = null;
  mockWsHandlers.current = {};
  Object.values(service).forEach((fn) => {
    if (jest.isMockFunction(fn)) fn.mockClear();
  });
  service.createGroupCall.mockResolvedValue(createResponse());
  service.joinGroupCall.mockResolvedValue({ ...createResponse(), room: { ...apiRoom(), started_by_user_id: 'other' } });
  service.leaveGroupCall.mockResolvedValue(undefined);
  service.endGroupCallForAll.mockResolvedValue(undefined);
  service.fetchActiveGroupCall.mockResolvedValue(null);
  Camera.requestCameraPermissionsAsync.mockClear();
  Camera.requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  render(
    <GroupCallProvider>
      <Probe />
    </GroupCallProvider>,
  );
});

afterEach(() => {
  alertSpy.mockRestore();
});

/* ───────────── начало звонка ───────────── */

describe('startGroupCall', () => {
  it('создаёт комнату, подключается к LiveKit и становится активным создателем', async () => {
    await startCall();
    expect(service.createGroupCall).toHaveBeenCalledWith('chat-1');
    expect(room().connect).toHaveBeenCalledWith('wss://lk.test', 'tok', { autoSubscribe: true });
    expect(room().localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(api.state).toMatchObject({
      phase: 'active',
      roomId: 'room-1',
      chatId: 'chat-1',
      isCreator: true,
      isMuted: false,
    });
    expect(api.state.participants.some((p) => p.isLocal)).toBe(true);
    expect(api.isInCallForChat('chat-1')).toBe(true);
    expect(api.isInCallForChat('chat-2')).toBe(false);
  });

  it('регрессия: двойное нажатие «начать» создаёт ровно одну комнату', async () => {
    await act(async () => {
      void api.startGroupCall('chat-1', 'Чат');
      void api.startGroupCall('chat-1', 'Чат');
    });
    await flush();
    expect(service.createGroupCall).toHaveBeenCalledTimes(1);
    expect(livekit.Room.instances).toHaveLength(1);
  });

  it('регрессия: если LiveKit не подключился, из созданной на сервере комнаты выходим (нет «призрака»)', async () => {
    livekit.Room.failNextConnect = new Error('ICE failed');
    await startCall();
    expect(service.leaveGroupCall).toHaveBeenCalledWith('room-1');
    expect(api.state.phase).toBe('idle');
    expect(alertSpy).toHaveBeenCalledWith('Не удалось начать звонок', 'ICE failed');
  });

  it('если сервер не смог создать комнату, выходить из неё не нужно', async () => {
    service.createGroupCall.mockRejectedValueOnce(new Error('500'));
    await startCall();
    expect(service.leaveGroupCall).not.toHaveBeenCalled();
    expect(api.state.phase).toBe('idle');
    expect(alertSpy).toHaveBeenCalledWith('Не удалось начать звонок', '500');
  });

  it('после неудачи можно начать звонок снова (флаг «в процессе» снят)', async () => {
    service.createGroupCall.mockRejectedValueOnce(new Error('500'));
    await startCall();
    await startCall();
    expect(api.state.phase).toBe('active');
  });

  it('нельзя начать, пока идёт обычный звонок', async () => {
    mockCallState.value = { phase: 'active' };
    render(
      <GroupCallProvider>
        <Probe />
      </GroupCallProvider>,
    );
    await startCall();
    expect(service.createGroupCall).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Голосовой чат', 'Сначала завершите текущий звонок.');
  });

  it('нельзя начать второй голосовой чат, пока находишься в первом', async () => {
    await startCall('chat-1');
    await startCall('chat-2');
    expect(service.createGroupCall).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith('Голосовой чат', 'Сначала выйдите из текущего голосового чата.');
  });

  it('микрофон не разрешён → ошибка, выход из серверной комнаты, состояние idle', async () => {
    const { Audio } = require('expo-av') as { Audio: { requestPermissionsAsync: jest.Mock } };
    Audio.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    await startCall();
    expect(service.leaveGroupCall).toHaveBeenCalledWith('room-1');
    expect(api.state.phase).toBe('idle');
    expect(alertSpy).toHaveBeenCalledWith('Не удалось начать звонок', 'Microphone permission denied');
  });

  it('время начала берётся из ответа сервера (секунды приводятся к мс)', async () => {
    service.createGroupCall.mockResolvedValueOnce({
      ...createResponse(),
      room: { ...apiRoom(), started_at: 1_760_000_000 },
    });
    await startCall();
    expect(api.state.startedAt).toBe(1_760_000_000_000);
  });
});

/* ───────────── присоединение ───────────── */

describe('joinGroupCall', () => {
  it('подключается и становится активным (не создателем)', async () => {
    await joinCall();
    expect(service.joinGroupCall).toHaveBeenCalledWith('room-1');
    expect(api.state).toMatchObject({ phase: 'active', roomId: 'room-1', isCreator: false });
  });

  it('регрессия: двойное нажатие «присоединиться» подключает один раз', async () => {
    await act(async () => {
      void api.joinGroupCall('room-1', 'chat-1', 'Чат');
      void api.joinGroupCall('room-1', 'chat-1', 'Чат');
    });
    await flush();
    expect(service.joinGroupCall).toHaveBeenCalledTimes(1);
    expect(livekit.Room.instances).toHaveLength(1);
  });

  it('регрессия: «присоединиться» к комнате, где уже сидишь в свёрнутом виде, разворачивает, а не подключает второй раз', async () => {
    await joinCall();
    act(() => api.minimize());
    expect(api.state.phase).toBe('minimized');

    await joinCall();
    expect(service.joinGroupCall).toHaveBeenCalledTimes(1);
    expect(livekit.Room.instances).toHaveLength(1);
    expect(api.state.phase).toBe('active');
  });

  it('в другую комнату нельзя, пока находишься в текущей', async () => {
    await joinCall('room-1', 'chat-1');
    await joinCall('room-2', 'chat-2');
    expect(service.joinGroupCall).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith('Голосовой чат', 'Сначала выйдите из текущего голосового чата.');
  });

  it('регрессия: LiveKit не подключился после успешного входа на сервере → выходим из серверной комнаты', async () => {
    livekit.Room.failNextConnect = new Error('timeout');
    await joinCall();
    expect(service.leaveGroupCall).toHaveBeenCalledWith('room-1');
    expect(api.state.phase).toBe('idle');
    expect(alertSpy).toHaveBeenCalledWith('Не удалось присоединиться', 'timeout');
  });

  it('если сервер отказал во входе, выходить не из чего', async () => {
    service.joinGroupCall.mockRejectedValueOnce(new Error('forbidden'));
    await joinCall();
    expect(service.leaveGroupCall).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Не удалось присоединиться', 'forbidden');
  });

  it('звонок уже завершён (404) → комната убирается из списка активных и показывается понятное сообщение', async () => {
    api.applyActiveRoomSnapshot('chat-1', apiRoom());
    service.joinGroupCall.mockRejectedValueOnce(new Error('Group call not found'));
    await joinCall();
    expect(alertSpy).toHaveBeenCalledWith('Голосовой чат', 'Звонок уже завершён или недоступен.');
    await flush();
    expect(api.activeRoomByChatId['chat-1']).toBeNull();
  });

  it('нельзя присоединиться во время обычного звонка', async () => {
    mockCallState.value = { phase: 'active' };
    render(
      <GroupCallProvider>
        <Probe />
      </GroupCallProvider>,
    );
    await joinCall();
    expect(service.joinGroupCall).not.toHaveBeenCalled();
  });
});

/* ───────────── выход и завершение ───────────── */

describe('выход и завершение', () => {
  it('leaveGroupCall: сообщает серверу, отключает комнату и сбрасывает состояние', async () => {
    await startCall();
    await act(async () => api.leaveGroupCall());
    expect(service.leaveGroupCall).toHaveBeenCalledWith('room-1');
    expect(room().disconnect).toHaveBeenCalled();
    expect(api.state.phase).toBe('idle');
    expect(api.state.roomId).toBeNull();
  });

  it('если сервер не ответил на leave, локальная очистка всё равно выполняется', async () => {
    await startCall();
    service.leaveGroupCall.mockRejectedValueOnce(new Error('network'));
    await act(async () => api.leaveGroupCall());
    expect(api.state.phase).toBe('idle');
  });

  it('после выхода: пустая активная комната убирается из списка', async () => {
    await startCall();
    service.fetchActiveGroupCall.mockResolvedValueOnce(null);
    await act(async () => api.leaveGroupCall());
    await flush();
    expect(api.activeRoomByChatId['chat-1']).toBeNull();
  });

  it('преднамеренный выход не отправляет leave второй раз из события Disconnected', async () => {
    await startCall();
    await act(async () => api.leaveGroupCall());
    expect(service.leaveGroupCall).toHaveBeenCalledTimes(1);
  });

  it('неожиданный разрыв LiveKit (Disconnected) → серверу сообщается о выходе, состояние сброшено', async () => {
    await startCall();
    service.leaveGroupCall.mockClear();
    await act(async () => {
      room().emit('disconnected');
    });
    await flush();
    expect(service.leaveGroupCall).toHaveBeenCalledWith('room-1');
    expect(api.state.phase).toBe('idle');
  });

  it('endGroupCallForAll: завершает для всех, убирает комнату и сбрасывает состояние', async () => {
    await startCall();
    await act(async () => api.endGroupCallForAll());
    expect(service.endGroupCallForAll).toHaveBeenCalledWith('room-1');
    expect(api.state.phase).toBe('idle');
    expect(api.activeRoomByChatId['chat-1']).toBeNull();
  });

  it('регрессия: неудача «завершить для всех» оставляет звонок и не «залипает» флаг выхода — следующий обрыв сообщит серверу', async () => {
    await startCall();
    service.endGroupCallForAll.mockRejectedValueOnce(new Error('403'));
    await act(async () => api.endGroupCallForAll());
    expect(alertSpy).toHaveBeenCalledWith('Не удалось завершить звонок', '403');
    expect(api.state.phase).toBe('active');

    service.leaveGroupCall.mockClear();
    await act(async () => {
      room().emit('disconnected');
    });
    await flush();
    expect(service.leaveGroupCall).toHaveBeenCalledWith('room-1');
  });

  it('endGroupCallForAll без активного звонка ничего не делает', async () => {
    await act(async () => api.endGroupCallForAll());
    expect(service.endGroupCallForAll).not.toHaveBeenCalled();
  });
});

/* ───────────── управление ───────────── */

describe('управление звонком', () => {
  it('minimize/expand меняют фазу только из допустимых состояний', async () => {
    act(() => api.minimize());
    expect(api.state.phase).toBe('idle');
    await startCall();
    act(() => api.minimize());
    expect(api.state.phase).toBe('minimized');
    act(() => api.expand());
    expect(api.state.phase).toBe('active');
    act(() => api.expand());
    expect(api.state.phase).toBe('active');
  });

  it('mute выключает микрофон и помечает локального участника', async () => {
    await startCall();
    await act(async () => api.toggleMute());
    expect(room().localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    expect(api.state.isMuted).toBe(true);
    expect(api.state.participants.find((p) => p.isLocal)?.isMuted).toBe(true);

    await act(async () => api.toggleMute());
    expect(room().localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
    expect(api.state.isMuted).toBe(false);
  });

  it('ошибка микрофона: состояние не меняется, показывается сообщение', async () => {
    await startCall();
    room().localParticipant.setMicrophoneEnabled.mockRejectedValueOnce(new Error('mic busy'));
    await act(async () => api.toggleMute());
    expect(api.state.isMuted).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith('Микрофон', 'mic busy');
  });

  it('mute без комнаты ничего не делает', async () => {
    await act(async () => api.toggleMute());
    expect(api.state.isMuted).toBe(false);
  });

  it('видео: без разрешения камеры показывается ошибка и камера не включается', async () => {
    await startCall();
    Camera.requestCameraPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    await act(async () => api.toggleVideo());
    expect(alertSpy).toHaveBeenCalledWith('Не удалось включить видео', 'Нет доступа к камере');
  });

  it('видео: с разрешением включает камеру', async () => {
    await startCall();
    await act(async () => api.toggleVideo());
    const setCamera = (room() as unknown as { localParticipant: { setCameraEnabled: jest.Mock } })
      .localParticipant.setCameraEnabled;
    expect(setCamera).toHaveBeenCalledWith(true);
  });

  it('видео не переключается без активного подключения', async () => {
    await act(async () => api.toggleVideo());
    expect(Camera.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  });

  it('динамик переключается (флаг в состоянии)', async () => {
    await startCall();
    expect(api.state.isSpeakerOn).toBe(true);
    await act(async () => api.toggleSpeaker());
    expect(api.state.isSpeakerOn).toBe(false);
  });
});

/* ───────────── события сервера ───────────── */

describe('события WebSocket', () => {
  it('onGroupCallStarted: запоминает активную комнату чата', async () => {
    await act(async () => {
      mockWsHandlers.current.onGroupCallStarted({
        chat_id: 'chat-9',
        room_id: 'room-9',
        started_by: 'u2',
        started_at: 1_760_000_000,
      });
    });
    expect(api.activeRoomByChatId['chat-9']).toMatchObject({
      id: 'room-9',
      started_by_user_id: 'u2',
      started_at: 1_760_000_000_000,
    });
  });

  it('onGroupCallStarted без chat_id/room_id игнорируется', async () => {
    await act(async () => {
      mockWsHandlers.current.onGroupCallStarted({ chat_id: 'chat-9' });
      mockWsHandlers.current.onGroupCallStarted({});
    });
    expect(api.activeRoomByChatId).toEqual({});
  });

  it('onGroupCallEnded для чата, где мы в звонке, завершает наш звонок', async () => {
    await startCall('chat-1');
    await act(async () => {
      mockWsHandlers.current.onGroupCallEnded({ chat_id: 'chat-1' });
    });
    await flush();
    expect(api.state.phase).toBe('idle');
    expect(api.activeRoomByChatId['chat-1']).toBeNull();
  });

  it('onGroupCallEnded для другого чата не трогает наш звонок', async () => {
    await startCall('chat-1');
    await act(async () => {
      mockWsHandlers.current.onGroupCallEnded({ chat_id: 'chat-2' });
    });
    expect(api.state.phase).toBe('active');
  });

  it('onGroupCallParticipants: обновляет счётчик участников комнаты', async () => {
    await act(async () => {
      api.applyActiveRoomSnapshot('chat-1', apiRoom());
    });
    await act(async () => {
      mockWsHandlers.current.onGroupCallParticipants({
        chat_id: 'chat-1',
        room_id: 'room-1',
        participants: [
          { user_id: 'a', display_name: 'A', avatar_url: null, is_muted: false },
          { user_id: 'b', display_name: 'B', avatar_url: null, is_muted: true },
        ],
      });
    });
    expect(api.activeRoomByChatId['chat-1']?.participant_count).toBe(2);
  });

  it('пустой список участников во время подключения не закрывает комнату', async () => {
    let resolveCreate: (value: unknown) => void = () => undefined;
    service.createGroupCall.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    await act(async () => {
      void api.startGroupCall('chat-1', 'Чат');
    });
    expect(api.state.phase).toBe('creating');

    await act(async () => {
      mockWsHandlers.current.onGroupCallParticipants({
        chat_id: 'chat-1',
        room_id: 'room-1',
        participants: [],
      });
    });
    expect(api.state.phase).toBe('creating');

    await act(async () => resolveCreate(createResponse()));
    await flush();
    expect(api.state.phase).toBe('active');
  });

  it('регрессия: пустой список участников, пока мы уже на связи, не выкидывает из живого звонка (конец приходит отдельным событием)', async () => {
    await startCall('chat-1');
    expect(api.state.phase).toBe('active');
    await act(async () => {
      mockWsHandlers.current.onGroupCallParticipants({
        chat_id: 'chat-1',
        room_id: 'room-1',
        participants: [],
      });
    });
    await flush();
    expect(api.state.phase).toBe('active');
    expect(room().disconnect).not.toHaveBeenCalled();
  });

  it('пустой список участников у активной (не подключающейся) комнаты — комната завершена', async () => {
    api.applyActiveRoomSnapshot('chat-5', apiRoom('room-5', 'chat-5'));
    await act(async () => {
      mockWsHandlers.current.onGroupCallParticipants({
        chat_id: 'chat-5',
        room_id: 'room-5',
        participants: [],
      });
    });
    expect(api.activeRoomByChatId['chat-5']).toBeNull();
  });

  it('снимок участников из другой комнаты игнорируется', async () => {
    await startCall('chat-1');
    await act(async () => {
      api.applyParticipantsSnapshot('chat-1', 'other-room', [
        { user_id: 'x', display_name: 'X', avatar_url: null, is_muted: false },
      ]);
    });
    expect(api.state.participants.some((p) => p.userId === 'x')).toBe(false);
  });

  it('снимок участников той же комнаты добавляет недостающих и подставляет имена', async () => {
    await startCall('chat-1');
    await act(async () => {
      api.applyParticipantsSnapshot('chat-1', 'room-1', [
        { user_id: 'x', display_name: 'Иван', avatar_url: null, is_muted: true },
      ]);
    });
    const ivan = api.state.participants.find((p) => p.userId === 'x');
    expect(ivan).toMatchObject({ displayName: 'Иван', isMuted: true, isLocal: false });
  });
});
