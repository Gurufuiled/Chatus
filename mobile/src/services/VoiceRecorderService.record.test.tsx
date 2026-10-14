/**
 * Запись голосового: быстрый старт, таймер по длительности рекордера, дорожка по линейной амплитуде.
 * Запуск: npx jest src/services/VoiceRecorderService.record.test.tsx
 */
type StatusCallback = (status: { metering?: number; durationMillis?: number }) => void;

const mockAudio = {
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
};
const mockCreateAsync = jest.fn();
const mockRecording = {
  stopAndUnloadAsync: jest.fn(() => Promise.resolve({ durationMillis: 4000 })),
  getURI: jest.fn(() => 'file:///cache/rec.m4a'),
};
const mockOrder: string[] = [];
const mockPlayer = {
  hasActiveSound: jest.fn(() => false),
  stop: jest.fn(() => Promise.resolve()),
  invalidateAudioMode: jest.fn(),
};
const mockRelease = jest.fn(() => {
  mockOrder.push('release');
  return Promise.resolve();
});
let mockStatusCallback: StatusCallback | null = null;

jest.mock('expo-av', () => ({
  Audio: {
    getPermissionsAsync: () => mockAudio.getPermissionsAsync(),
    requestPermissionsAsync: () => mockAudio.requestPermissionsAsync(),
    setAudioModeAsync: (...args: unknown[]) => {
      mockOrder.push('audioMode');
      return (mockAudio.setAudioModeAsync as (...a: unknown[]) => Promise<void>)(...args);
    },
    RecordingOptionsPresets: { HIGH_QUALITY: { android: {}, ios: {} } },
    Recording: {
      createAsync: (options: unknown, cb: StatusCallback, interval: number) => {
        mockOrder.push('createAsync');
        mockStatusCallback = cb;
        return mockCreateAsync(options, cb, interval);
      },
    },
  },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../utils/releaseMediaAudioSession', () => ({ releaseMediaAudioSession: () => mockRelease() }));
jest.mock('./VoicePlayerService', () => ({ VoicePlayerService: mockPlayer }));

// require, а не import: import поднимается выше определения mock-переменных
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { VoiceRecorderService } = require('./VoiceRecorderService') as typeof import('./VoiceRecorderService');

beforeEach(() => {
  jest.clearAllMocks();
  mockOrder.length = 0;
  mockStatusCallback = null;
  mockAudio.getPermissionsAsync.mockImplementation(() => Promise.resolve({ status: 'granted' }));
  mockAudio.requestPermissionsAsync.mockImplementation(() => Promise.resolve({ status: 'granted' }));
  mockCreateAsync.mockImplementation(() => Promise.resolve({ recording: mockRecording }));
  mockRecording.stopAndUnloadAsync.mockImplementation(() => Promise.resolve({ durationMillis: 4000 }));
  mockPlayer.hasActiveSound.mockReturnValue(false);
});

afterEach(async () => {
  if (VoiceRecorderService.isRecording()) await VoiceRecorderService.stopRecording().catch(() => undefined);
});

describe('быстрый старт записи (таймер стоял ~1.5 с, пока шли лишние шаги)', () => {
  it('выданное разрешение проверяется без системного запроса', async () => {
    await VoiceRecorderService.startRecording();
    expect(mockAudio.getPermissionsAsync).toHaveBeenCalled();
    expect(mockAudio.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('если разрешения нет — запрашивается', async () => {
    mockAudio.getPermissionsAsync.mockImplementation(() => Promise.resolve({ status: 'undetermined' }));
    await VoiceRecorderService.startRecording();
    expect(mockAudio.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('отказ в разрешении — понятная ошибка, запись не создаётся', async () => {
    mockAudio.getPermissionsAsync.mockImplementation(() => Promise.resolve({ status: 'denied' }));
    mockAudio.requestPermissionsAsync.mockImplementation(() => Promise.resolve({ status: 'denied' }));
    await expect(VoiceRecorderService.startRecording()).rejects.toThrow(/permission denied/i);
    expect(mockCreateAsync).not.toHaveBeenCalled();
    expect(VoiceRecorderService.isRecording()).toBe(false);
  });

  it('плеер останавливается, только если что-то играет', async () => {
    await VoiceRecorderService.startRecording();
    expect(mockPlayer.stop).not.toHaveBeenCalled();
    await VoiceRecorderService.stopRecording();

    mockPlayer.hasActiveSound.mockReturnValue(true);
    await VoiceRecorderService.startRecording();
    expect(mockPlayer.stop).toHaveBeenCalledTimes(1);
  });

  it('до старта записи звуковой режим выставляется один раз, без лишнего сброса сессии', async () => {
    await VoiceRecorderService.startRecording();
    // раньше: release + ensureAudioMode (два обращения к нативному аудио) перед созданием записи
    expect(mockOrder.slice(0, 2)).toEqual(['audioMode', 'createAsync']);
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('после остановки обычный режим воспроизведения восстанавливается', async () => {
    await VoiceRecorderService.startRecording();
    await VoiceRecorderService.stopRecording();
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('повторный старт во время записи — ошибка', async () => {
    await VoiceRecorderService.startRecording();
    await expect(VoiceRecorderService.startRecording()).rejects.toThrow(/already in progress/i);
  });

  it('ошибка создания записи возвращает звуковой режим и сбрасывает таймер', async () => {
    mockCreateAsync.mockImplementation(() => Promise.reject(new Error('no mic')));
    const listener = jest.fn();
    VoiceRecorderService.subscribeToDuration(listener);
    await expect(VoiceRecorderService.startRecording()).rejects.toThrow('no mic');
    expect(mockRelease).toHaveBeenCalled();
    expect(listener).toHaveBeenLastCalledWith(0);
    expect(VoiceRecorderService.isRecording()).toBe(false);
  });
});

describe('таймер = длительность рекордера', () => {
  it('подписчик сразу получает текущее значение, затем длительность из статусов рекордера', async () => {
    const listener = jest.fn();
    const unsubscribe = VoiceRecorderService.subscribeToDuration(listener);
    expect(listener).toHaveBeenCalledWith(0);

    await VoiceRecorderService.startRecording();
    mockStatusCallback?.({ durationMillis: 1200 });
    mockStatusCallback?.({ durationMillis: 1250 });
    expect(listener).toHaveBeenCalledWith(1200);
    expect(listener).toHaveBeenLastCalledWith(1250);

    unsubscribe();
    mockStatusCallback?.({ durationMillis: 3000 });
    expect(listener).not.toHaveBeenCalledWith(3000);
  });

  it('поздний подписчик (окно записи открылось позже старта) сразу видит накопленную длительность', async () => {
    await VoiceRecorderService.startRecording();
    mockStatusCallback?.({ durationMillis: 1700 });
    const late = jest.fn();
    VoiceRecorderService.subscribeToDuration(late);
    expect(late).toHaveBeenCalledWith(1700);
  });

  it('после остановки длительность сбрасывается в 0', async () => {
    const listener = jest.fn();
    VoiceRecorderService.subscribeToDuration(listener);
    await VoiceRecorderService.startRecording();
    mockStatusCallback?.({ durationMillis: 2500 });
    await VoiceRecorderService.stopRecording();
    expect(listener).toHaveBeenLastCalledWith(0);
  });

  it('в сообщение уходит длительность файла от рекордера — ровно то, что было на таймере', async () => {
    await VoiceRecorderService.startRecording();
    mockStatusCallback?.({ durationMillis: 3900 });
    mockRecording.stopAndUnloadAsync.mockImplementation(() => Promise.resolve({ durationMillis: 4000 }));
    const result = await VoiceRecorderService.stopRecording();
    expect(result.durationMs).toBe(4000);
    expect(result.uri).toBe('file:///cache/rec.m4a');
  });

  it('если рекордер не вернул длительность, берётся время по часам от старта', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    await VoiceRecorderService.startRecording();
    now.mockReturnValue(1_003_500);
    mockRecording.stopAndUnloadAsync.mockImplementation(() => Promise.resolve({ durationMillis: 0 }));
    const result = await VoiceRecorderService.stopRecording();
    now.mockRestore();
    expect(result.durationMs).toBe(3500);
  });

  it('остановка без записи — ошибка', async () => {
    await expect(VoiceRecorderService.stopRecording()).rejects.toThrow(/No active recording/);
  });
});

describe('дорожка по линейной амплитуде (в паузах не «крик»)', () => {
  it('тихие отсчёты остаются низкими, речь — высокой, самое громкое место — на всю высоту', async () => {
    await VoiceRecorderService.startRecording();
    for (let i = 0; i < 120; i += 1) {
      // паузы (шум комнаты ~-48 дБ) и речь (-22 дБ…-10 дБ)
      mockStatusCallback?.({ metering: i % 30 < 10 ? -48 : -22 + (i % 4) * 4, durationMillis: i * 50 });
    }
    const result = await VoiceRecorderService.stopRecording();
    expect(result.waveform).toHaveLength(72);
    expect(Math.max(...result.waveform)).toBe(1);
    const quiet = result.waveform.filter((v) => v < 0.2).length;
    const loud = result.waveform.filter((v) => v > 0.6).length;
    expect(quiet).toBeGreaterThanOrEqual(15);
    expect(loud).toBeGreaterThanOrEqual(25);
  });

  it('запись одной тишины не раздувается до полной высоты', async () => {
    await VoiceRecorderService.startRecording();
    for (let i = 0; i < 80; i += 1) mockStatusCallback?.({ metering: -50, durationMillis: i * 50 });
    const result = await VoiceRecorderService.stopRecording();
    expect(Math.max(...result.waveform)).toBeLessThan(0.1);
  });

  it('живая дорожка подписчика отражает уровень и очищается после остановки', async () => {
    const live = jest.fn();
    VoiceRecorderService.subscribeToLiveWaveform(live);
    await VoiceRecorderService.startRecording();
    for (let i = 0; i < 60; i += 1) mockStatusCallback?.({ metering: -12, durationMillis: i * 50 });
    const last = live.mock.calls[live.mock.calls.length - 1][0] as number[];
    expect(last.length).toBe(28);
    expect(Math.min(...last)).toBeGreaterThan(0.4);
    await VoiceRecorderService.stopRecording();
    expect(live).toHaveBeenLastCalledWith([]);
  });
});
