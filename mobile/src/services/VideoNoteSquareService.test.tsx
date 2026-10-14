/**
 * Квадратный видеокружок для Telegram (регрессия: кружок приходил обычным видеороликом, потому что камера пишет
 * 4:3 / 16:9, а Telegram принимает кружком только квадрат).
 * Запуск: npx jest src/services/VideoNoteSquareService.test.tsx
 */
const mockPlatform = { OS: 'android' };
const mockNativeModules: { VideoSquare?: { cropToSquare: jest.Mock } } = {};
const mockGetThumbnail = jest.fn(
  (_uri: string, _options: Record<string, unknown>): Promise<{ uri: string }> =>
    Promise.resolve({ uri: 'file:///cache/square-thumb.jpg' }),
);

jest.mock('react-native', () => ({
  NativeModules: mockNativeModules,
  Platform: mockPlatform,
}));
jest.mock('expo-video-thumbnails', () => ({
  getThumbnailAsync: (uri: string, options: Record<string, unknown>) => mockGetThumbnail(uri, options),
}));

// require, а не import: import поднимается выше определения mock-переменных, и фабрики моков получили бы undefined
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { VIDEO_NOTE_SQUARE_SIDE_PX, ensureSquareVideoNote, isSquareVideoNoteSupported } =
  require('./VideoNoteSquareService') as typeof import('./VideoNoteSquareService');

const recording = {
  uri: 'file:///cache/Camera/rec.mp4',
  durationMs: 7300,
  thumbnailUri: 'file:///cache/rec-thumb.jpg',
};

const installNative = (impl?: (uri: string, side: number) => Promise<unknown>) => {
  mockNativeModules.VideoSquare = {
    cropToSquare: jest.fn(
      impl ??
        (() => Promise.resolve({ uri: 'file:///cache/video-note-square-1.mp4', width: 384, height: 384 })),
    ),
  };
  return mockNativeModules.VideoSquare;
};

beforeEach(() => {
  mockPlatform.OS = 'android';
  delete mockNativeModules.VideoSquare;
  mockGetThumbnail.mockClear();
  mockGetThumbnail.mockImplementation(() => Promise.resolve({ uri: 'file:///cache/square-thumb.jpg' }));
});

describe('ensureSquareVideoNote', () => {
  it('обрезает видео до квадрата стороной 384 px и отдаёт новый файл', async () => {
    const native = installNative();
    const outcome = await ensureSquareVideoNote(recording);

    expect(VIDEO_NOTE_SQUARE_SIDE_PX).toBe(384);
    expect(native.cropToSquare).toHaveBeenCalledWith(recording.uri, 384);
    expect(outcome.squared).toBe(true);
    expect(outcome.result.uri).toBe('file:///cache/video-note-square-1.mp4');
    expect(outcome.result.durationMs).toBe(7300);
    expect(outcome.error).toBeUndefined();
  });

  it('превью строится из квадратного файла (исходное было прямоугольным)', async () => {
    installNative();
    const outcome = await ensureSquareVideoNote(recording);
    expect(mockGetThumbnail).toHaveBeenCalledWith('file:///cache/video-note-square-1.mp4', { time: 0 });
    expect(outcome.result.thumbnailUri).toBe('file:///cache/square-thumb.jpg');
  });

  it('если превью построить не вышло, остаётся прежнее — отправка не срывается', async () => {
    installNative();
    mockGetThumbnail.mockImplementation(() => Promise.reject(new Error('no frame')));
    const outcome = await ensureSquareVideoNote(recording);
    expect(outcome.squared).toBe(true);
    expect(outcome.result.thumbnailUri).toBe(recording.thumbnailUri);
  });

  it('можно задать другую сторону', async () => {
    const native = installNative();
    await ensureSquareVideoNote(recording, 480);
    expect(native.cropToSquare).toHaveBeenCalledWith(recording.uri, 480);
  });

  it('ошибка обрезки не бросается: уходит исходный файл, причина возвращается для лога', async () => {
    installNative(() => Promise.reject(new Error('E_VIDEO_SQUARE: кодек недоступен')));
    const outcome = await ensureSquareVideoNote(recording);
    expect(outcome.squared).toBe(false);
    expect(outcome.result).toBe(recording);
    expect(outcome.error).toMatch(/кодек недоступен/);
    expect(mockGetThumbnail).not.toHaveBeenCalled();
  });

  it('нативный модуль вернул пустой ответ — исходный файл', async () => {
    installNative(() => Promise.resolve({}));
    const outcome = await ensureSquareVideoNote(recording);
    expect(outcome.squared).toBe(false);
    expect(outcome.result).toBe(recording);
    expect(outcome.error).toBeTruthy();
  });

  it('старая сборка без модуля: исходный файл и понятная причина', async () => {
    const outcome = await ensureSquareVideoNote(recording);
    expect(outcome.squared).toBe(false);
    expect(outcome.result).toBe(recording);
    expect(outcome.error).toMatch(/VideoSquare/);
  });

  it('не на Android (iOS) файл не трогается и модуль не вызывается', async () => {
    mockPlatform.OS = 'ios';
    const native = installNative();
    const outcome = await ensureSquareVideoNote(recording);
    expect(outcome).toEqual({ result: recording, squared: false });
    expect(native.cropToSquare).not.toHaveBeenCalled();
  });
});

describe('isSquareVideoNoteSupported', () => {
  it('true только на Android с нативным модулем', () => {
    expect(isSquareVideoNoteSupported()).toBe(false);
    installNative();
    expect(isSquareVideoNoteSupported()).toBe(true);
    mockPlatform.OS = 'ios';
    expect(isSquareVideoNoteSupported()).toBe(false);
  });
});
