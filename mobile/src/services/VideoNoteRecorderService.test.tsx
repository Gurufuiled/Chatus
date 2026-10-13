/**
 * Тесты VideoNoteRecorderService (запись видеокружка).
 * Запуск: npx jest src/services/VideoNoteRecorderService.test.tsx
 */
import { VideoNoteRecorderService } from './VideoNoteRecorderService';

const mockDeleteAsync = jest.fn(() => Promise.resolve());
jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...(args as [])),
}));
const mockGetThumbnailAsync = jest.fn(() => Promise.resolve({ uri: 'file:///thumb.jpg' }));
jest.mock('expo-video-thumbnails', () => ({
  getThumbnailAsync: (...args: unknown[]) => mockGetThumbnailAsync(...(args as [])),
}));

/** Фейковая камера: recordAsync резолвится, когда тест вызовет `finishRecording`. */
function makeCamera() {
  let finish: (value: { uri: string } | undefined) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const camera = {
    recordAsync: jest.fn(
      () =>
        new Promise<{ uri: string } | undefined>((resolve, reject) => {
          finish = resolve;
          fail = reject;
        }),
    ),
    stopRecording: jest.fn(),
    finishRecording: (uri: string | undefined) => finish(uri ? { uri } : undefined),
    failRecording: (error: Error) => fail(error),
  };
  return camera;
}

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

beforeEach(() => {
  mockDeleteAsync.mockClear();
  mockGetThumbnailAsync.mockClear();
  // сбрасываем состояние синглтона между тестами
  VideoNoteRecorderService.setCameraRef(null);
  VideoNoteRecorderService.cancelRecording();
});

describe('startRecording / stopRecording', () => {
  it('без камеры запись не начинается', async () => {
    await expect(VideoNoteRecorderService.startRecording()).rejects.toThrow('Camera ref not set');
  });

  it('вторую запись поверх идущей начать нельзя', async () => {
    const camera = makeCamera();
    VideoNoteRecorderService.setCameraRef(camera);
    await VideoNoteRecorderService.startRecording();
    await expect(VideoNoteRecorderService.startRecording()).rejects.toThrow('already in progress');
    VideoNoteRecorderService.cancelRecording();
  });

  it('stopRecording возвращает файл, длительность и превью', async () => {
    const camera = makeCamera();
    VideoNoteRecorderService.setCameraRef(camera);
    await VideoNoteRecorderService.startRecording();
    expect(VideoNoteRecorderService.isRecording()).toBe(true);

    const pending = VideoNoteRecorderService.stopRecording();
    camera.finishRecording('file:///note.mp4');
    const result = await pending;

    expect(camera.stopRecording).toHaveBeenCalledTimes(1);
    expect(result.uri).toBe('file:///note.mp4');
    expect(result.thumbnailUri).toBe('file:///thumb.jpg');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(VideoNoteRecorderService.isRecording()).toBe(false);
  });

  it('stopRecording без активной записи — ошибка', async () => {
    VideoNoteRecorderService.setCameraRef(makeCamera());
    await expect(VideoNoteRecorderService.stopRecording()).rejects.toThrow('No active recording');
  });

  it('камера не вернула файл — ошибка', async () => {
    const camera = makeCamera();
    VideoNoteRecorderService.setCameraRef(camera);
    await VideoNoteRecorderService.startRecording();
    const pending = VideoNoteRecorderService.stopRecording();
    camera.finishRecording(undefined);
    await expect(pending).rejects.toThrow('no file URI');
  });

  it('не удалось построить превью — запись всё равно возвращается, с пустым превью', async () => {
    mockGetThumbnailAsync.mockRejectedValueOnce(new Error('no thumb'));
    const camera = makeCamera();
    VideoNoteRecorderService.setCameraRef(camera);
    await VideoNoteRecorderService.startRecording();
    const pending = VideoNoteRecorderService.stopRecording();
    camera.finishRecording('file:///note.mp4');
    await expect(pending).resolves.toMatchObject({ uri: 'file:///note.mp4', thumbnailUri: '' });
  });
});

describe('cancelRecording (регрессия: долгая отмена со спиннером)', () => {
  it('возвращается мгновенно, не дожидаясь, пока камера закроет файл', async () => {
    const camera = makeCamera();
    VideoNoteRecorderService.setCameraRef(camera);
    await VideoNoteRecorderService.startRecording();

    // камера «ещё пишет»: recordAsync не завершён
    const startedAt = Date.now();
    VideoNoteRecorderService.cancelRecording(); // синхронный вызов
    expect(Date.now() - startedAt).toBeLessThan(50);

    expect(camera.stopRecording).toHaveBeenCalledTimes(1);
    expect(VideoNoteRecorderService.isRecording()).toBe(false);
  });

  it('не строит превью отменённой записи (раньше тратил время зря)', async () => {
    const camera = makeCamera();
    VideoNoteRecorderService.setCameraRef(camera);
    await VideoNoteRecorderService.startRecording();
    VideoNoteRecorderService.cancelRecording();
    camera.finishRecording('file:///cancelled.mp4');
    await flush();
    expect(mockGetThumbnailAsync).not.toHaveBeenCalled();
  });

  it('недописанный файл удаляется в фоне, когда камера его закроет', async () => {
    const camera = makeCamera();
    VideoNoteRecorderService.setCameraRef(camera);
    await VideoNoteRecorderService.startRecording();
    VideoNoteRecorderService.cancelRecording();
    expect(mockDeleteAsync).not.toHaveBeenCalled();

    camera.finishRecording('file:///cancelled.mp4');
    await flush();
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///cancelled.mp4', { idempotent: true });
  });

  it('если камера вернула ошибку — без необработанных исключений, удалять нечего', async () => {
    const camera = makeCamera();
    VideoNoteRecorderService.setCameraRef(camera);
    await VideoNoteRecorderService.startRecording();
    VideoNoteRecorderService.cancelRecording();
    camera.failRecording(new Error('camera died'));
    await flush();
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it('камера не вернула файл — удалять нечего', async () => {
    const camera = makeCamera();
    VideoNoteRecorderService.setCameraRef(camera);
    await VideoNoteRecorderService.startRecording();
    VideoNoteRecorderService.cancelRecording();
    camera.finishRecording(undefined);
    await flush();
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it('ошибка удаления файла не ломает отмену', async () => {
    mockDeleteAsync.mockRejectedValueOnce(new Error('EACCES'));
    const camera = makeCamera();
    VideoNoteRecorderService.setCameraRef(camera);
    await VideoNoteRecorderService.startRecording();
    VideoNoteRecorderService.cancelRecording();
    camera.finishRecording('file:///cancelled.mp4');
    await expect(flush()).resolves.toBeUndefined();
  });

  it('камера уже размонтирована (ref сброшен): отмена не падает, файл всё равно удаляется', async () => {
    const camera = makeCamera();
    VideoNoteRecorderService.setCameraRef(camera);
    await VideoNoteRecorderService.startRecording();
    VideoNoteRecorderService.setCameraRef(null);
    expect(() => VideoNoteRecorderService.cancelRecording()).not.toThrow();
    camera.finishRecording('file:///cancelled.mp4');
    await flush();
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///cancelled.mp4', { idempotent: true });
  });

  it('stopRecording камеры бросает исключение — отмена всё равно завершается', async () => {
    const camera = makeCamera();
    camera.stopRecording.mockImplementation(() => {
      throw new Error('already stopped');
    });
    VideoNoteRecorderService.setCameraRef(camera);
    await VideoNoteRecorderService.startRecording();
    expect(() => VideoNoteRecorderService.cancelRecording()).not.toThrow();
    expect(VideoNoteRecorderService.isRecording()).toBe(false);
  });

  it('без активной записи cancelRecording ничего не делает', () => {
    const camera = makeCamera();
    VideoNoteRecorderService.setCameraRef(camera);
    expect(() => VideoNoteRecorderService.cancelRecording()).not.toThrow();
    expect(camera.stopRecording).not.toHaveBeenCalled();
  });

  it('сразу после отмены можно начать новую запись, пока старый файл ещё закрывается', async () => {
    const first = makeCamera();
    VideoNoteRecorderService.setCameraRef(first);
    await VideoNoteRecorderService.startRecording();
    VideoNoteRecorderService.cancelRecording();

    const second = makeCamera();
    VideoNoteRecorderService.setCameraRef(second);
    await expect(VideoNoteRecorderService.startRecording()).resolves.toBeUndefined();
    expect(VideoNoteRecorderService.isRecording()).toBe(true);
    VideoNoteRecorderService.cancelRecording();
  });
});
