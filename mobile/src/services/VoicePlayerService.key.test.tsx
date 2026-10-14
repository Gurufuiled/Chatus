/**
 * Плеер голосовых хранит ключ сообщения, чьё голосовое играет: по нему верхняя плашка находит сообщение, даже когда
 * играет локальный кэш с другим адресом (регрессия: плашка перестала появляться).
 * Запуск: npx jest src/services/VoicePlayerService.key.test.tsx
 */
type FakeSound = {
  unloadAsync: jest.Mock;
  getStatusAsync: jest.Mock;
  setPositionAsync: jest.Mock;
  playAsync: jest.Mock;
  pauseAsync: jest.Mock;
  stopAsync: jest.Mock;
  setRateAsync: jest.Mock;
};

const mockSounds: FakeSound[] = [];
const makeSound = (): FakeSound => ({
  unloadAsync: jest.fn(() => Promise.resolve()),
  getStatusAsync: jest.fn(() =>
    Promise.resolve({ isLoaded: true, isPlaying: true, positionMillis: 0, durationMillis: 8000, rate: 1 }),
  ),
  setPositionAsync: jest.fn(() => Promise.resolve()),
  playAsync: jest.fn(() => Promise.resolve()),
  pauseAsync: jest.fn(() => Promise.resolve()),
  stopAsync: jest.fn(() => Promise.resolve()),
  setRateAsync: jest.fn(() => Promise.resolve()),
});

jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    Sound: {
      createAsync: jest.fn(() => {
        const sound = makeSound();
        mockSounds.push(sound);
        return Promise.resolve({ sound });
      }),
    },
  },
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///doc/',
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: true, isDirectory: true })),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  downloadAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('../utils/releaseMediaAudioSession', () => ({ releaseMediaAudioSession: () => Promise.resolve() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { VoicePlayerService } = require('./VoicePlayerService') as typeof import('./VoicePlayerService');

beforeEach(async () => {
  mockSounds.length = 0;
  await VoicePlayerService.stop();
});

describe('VoicePlayerService: ключ сообщения', () => {
  it('в начале ключа нет', () => {
    expect(VoicePlayerService.getSnapshot().currentVoiceKey).toBeNull();
  });

  it('запуск с ключом: он попадает в снимок вместе с адресом', async () => {
    await VoicePlayerService.play('file:///voice/a.m4a', undefined, 'msg-A');
    const snapshot = VoicePlayerService.getSnapshot();
    expect(snapshot.currentVoiceUri).toBe('file:///voice/a.m4a');
    expect(snapshot.currentVoiceKey).toBe('msg-A');
  });

  it('запуск без ключа — ключ пустой (прежнее поведение для старых вызовов)', async () => {
    await VoicePlayerService.play('file:///voice/a.m4a');
    expect(VoicePlayerService.getSnapshot().currentVoiceKey).toBeNull();
  });

  it('другое голосовое заменяет и адрес, и ключ', async () => {
    await VoicePlayerService.play('file:///voice/a.m4a', undefined, 'msg-A');
    await VoicePlayerService.play('file:///voice/b.m4a', undefined, 'msg-B');
    const snapshot = VoicePlayerService.getSnapshot();
    expect(snapshot.currentVoiceUri).toBe('file:///voice/b.m4a');
    expect(snapshot.currentVoiceKey).toBe('msg-B');
    expect(mockSounds[0].unloadAsync).toHaveBeenCalled(); // предыдущее выгружено
  });

  it('то же голосовое (возобновление/перемотка) не создаёт новый звук и сохраняет ключ', async () => {
    await VoicePlayerService.play('file:///voice/a.m4a', undefined, 'msg-A');
    await VoicePlayerService.play('file:///voice/a.m4a', 3000, 'msg-A');
    expect(mockSounds).toHaveLength(1);
    expect(mockSounds[0].setPositionAsync).toHaveBeenCalledWith(3000);
    expect(VoicePlayerService.getSnapshot().currentVoiceKey).toBe('msg-A');
  });

  it('возобновление без ключа (кнопка на верхней плашке) не стирает ключ', async () => {
    await VoicePlayerService.play('file:///voice/a.m4a', undefined, 'msg-A');
    await VoicePlayerService.play('file:///voice/a.m4a');
    expect(VoicePlayerService.getSnapshot().currentVoiceKey).toBe('msg-A');
  });

  it('остановка сбрасывает ключ вместе с адресом (плашка исчезает)', async () => {
    await VoicePlayerService.play('file:///voice/a.m4a', undefined, 'msg-A');
    await VoicePlayerService.stop();
    const snapshot = VoicePlayerService.getSnapshot();
    expect(snapshot.currentVoiceUri).toBeNull();
    expect(snapshot.currentVoiceKey).toBeNull();
  });

  it('пауза ключ не трогает: плашка остаётся и позволяет продолжить', async () => {
    await VoicePlayerService.play('file:///voice/a.m4a', undefined, 'msg-A');
    mockSounds[0].getStatusAsync.mockResolvedValue({
      isLoaded: true,
      isPlaying: false,
      positionMillis: 2000,
      durationMillis: 8000,
      rate: 1,
    });
    await VoicePlayerService.pause();
    const snapshot = VoicePlayerService.getSnapshot();
    expect(snapshot.currentVoiceKey).toBe('msg-A');
    expect(snapshot.status.isPlaying).toBe(false);
    expect(snapshot.status.positionMs).toBe(2000);
  });

  it('подписчики получают уведомление при смене ключа', async () => {
    const listener = jest.fn();
    const unsubscribe = VoicePlayerService.subscribe(listener);
    await VoicePlayerService.play('file:///voice/a.m4a', undefined, 'msg-A');
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});
