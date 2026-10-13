import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { VideoNoteRecorder } from './VideoNoteRecorder';
import {
  BAR_HEIGHT,
  BAR_INSET,
  RAIL_WIDTH,
  SEND_BUTTON_SIZE,
} from './videoNoteRecorderLayout';

jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('@expo/vector-icons/Feather', () => () => null);
// значения стабильные между рендерами: новый объект на каждый рендер зациклил бы эффекты компонента
jest.mock('expo-camera', () => {
  const granted = [{ granted: true }, jest.fn()];
  const React = require('react');
  return {
    // камера сообщает о готовности асинхронно, уже после монтирования (как настоящая)
    CameraView: ({ onCameraReady }: { onCameraReady?: () => void }) => {
      React.useEffect(() => {
        void Promise.resolve().then(() => onCameraReady?.());
      }, []);
      return null;
    },
    useCameraPermissions: () => granted,
    useMicrophonePermissions: () => granted,
  };
});
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  return { useSafeAreaInsets: () => insets };
});
jest.mock('../services/VideoNoteRecorderService', () => ({
  MAX_DURATION_SECONDS: 60,
  VideoNoteRecorderService: {
    setCameraRef: jest.fn(),
    startRecording: jest.fn(() => new Promise(() => undefined)),
    stopRecording: jest.fn(() => Promise.resolve(null)),
    cancelRecording: jest.fn(),
    isRecording: jest.fn(() => false),
  },
}));

const flat = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as never) as Record<string, number | string | undefined>;

const renderRecorder = (onCancel = jest.fn()) =>
  render(<VideoNoteRecorder visible onComplete={jest.fn()} onCancel={onCancel} />);

describe('VideoNoteRecorder: нижняя панель', () => {
  it('таймер, «Отмена» и кнопка отправки находятся в одной плашке', () => {
    const { getByText, getByTestId } = renderRecorder();
    expect(getByText('0:00')).toBeTruthy();
    expect(getByText('Отмена')).toBeTruthy();
    expect(getByTestId('video-note-send-button')).toBeTruthy();
    expect(getByTestId('video-note-controls-bar')).toBeTruthy();
  });

  it('кнопка отправки не выше плашки и лежит внутри неё (не торчит над ней)', () => {
    const { getByTestId } = renderRecorder();
    const bar = flat(getByTestId('video-note-controls-bar'));
    const send = flat(getByTestId('video-note-send-button'));
    expect(bar.height).toBe(BAR_HEIGHT);
    expect(send.width).toBe(SEND_BUTTON_SIZE);
    expect(send.height).toBe(SEND_BUTTON_SIZE);
    expect(send.height as number).toBeLessThan(bar.height as number);
    // раньше кнопка была абсолютной и выступала за плашку
    expect(send.position).toBeUndefined();
  });

  it('колонка «камера / VIDEO» стоит над кнопкой отправки: та же ширина и тот же правый отступ', () => {
    const { getByTestId } = renderRecorder();
    const rail = flat(getByTestId('video-note-rail'));
    expect(rail.width).toBe(RAIL_WIDTH);
    expect(rail.width).toBe(SEND_BUTTON_SIZE);
    expect(rail.right).toBe(BAR_INSET);
  });

  it('на плашке нет цветных пятен слева/справа — только один ровный слой', () => {
    const { getByTestId } = renderRecorder();
    const bar = getByTestId('video-note-controls-bar');
    const washes = bar.children.filter(
      (c) => typeof c !== 'string' && (c as { props?: { style?: unknown } }).props?.style != null,
    );
    // все слои плашки, кроме строки с кнопками, — прозрачно-белые, без розового/бирюзового
    for (const layer of washes) {
      const bg = String(flat(layer as never).backgroundColor ?? '');
      expect(bg).not.toMatch(/246,\s*177,\s*232|146,\s*241,\s*238/);
    }
  });

  it('«Отмена» вызывает onCancel', async () => {
    const onCancel = jest.fn();
    const { getByLabelText } = renderRecorder(onCancel);
    fireEvent.press(getByLabelText('Отменить запись'));
    await Promise.resolve();
    expect(onCancel).toHaveBeenCalled();
  });

});

describe('VideoNoteRecorder: отмена (регрессия: долгая отмена со спиннером)', () => {
  const { VideoNoteRecorderService } = require('../services/VideoNoteRecorderService') as {
    VideoNoteRecorderService: Record<string, jest.Mock>;
  };

  beforeEach(() => {
    Object.values(VideoNoteRecorderService).forEach((fn) => fn.mockClear());
    VideoNoteRecorderService.isRecording.mockReturnValue(false);
    VideoNoteRecorderService.startRecording.mockImplementation(() => new Promise(() => undefined));
    VideoNoteRecorderService.stopRecording.mockImplementation(() => Promise.resolve(null));
  });

  it('отмена закрывает окно сразу и синхронно, не дожидаясь остановки камеры', () => {
    VideoNoteRecorderService.isRecording.mockReturnValue(true);
    // камера «долго допишет файл»: stopRecording не завершается никогда
    VideoNoteRecorderService.stopRecording.mockImplementation(() => new Promise(() => undefined));
    const onCancel = jest.fn();
    const { getByLabelText } = renderRecorder(onCancel);

    fireEvent.press(getByLabelText('Отменить запись'));

    expect(onCancel).toHaveBeenCalledTimes(1); // сразу, без await
    expect(VideoNoteRecorderService.cancelRecording).toHaveBeenCalledTimes(1);
    // раньше отмена шла через stopRecording (ждал файл и превью)
    expect(VideoNoteRecorderService.stopRecording).not.toHaveBeenCalled();
  });

  it('во время отмены не показывается спиннер загрузки', () => {
    VideoNoteRecorderService.isRecording.mockReturnValue(true);
    const { getByLabelText, UNSAFE_queryAllByType } = renderRecorder();
    fireEvent.press(getByLabelText('Отменить запись'));
    const { ActivityIndicator } = require('react-native') as typeof import('react-native');
    expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
  });

  it('отмена до начала записи тоже мгновенная и ничего не останавливает лишний раз', () => {
    VideoNoteRecorderService.isRecording.mockReturnValue(false);
    const onCancel = jest.fn();
    const { getByLabelText } = renderRecorder(onCancel);
    fireEvent.press(getByLabelText('Отменить запись'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(VideoNoteRecorderService.stopRecording).not.toHaveBeenCalled();
  });

  it('идёт отправка (запись остановлена и сохраняется) — отмена игнорируется', async () => {
    VideoNoteRecorderService.isRecording.mockReturnValue(true);
    VideoNoteRecorderService.startRecording.mockResolvedValue(undefined); // запись началась
    VideoNoteRecorderService.stopRecording.mockImplementation(() => new Promise(() => undefined));
    const onCancel = jest.fn();
    const { getByTestId, getByLabelText } = renderRecorder(onCancel);
    // камера готова → запись началась (несколько тиков: эффекты и промисы цепочкой)
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    fireEvent.press(getByTestId('video-note-send-button'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(VideoNoteRecorderService.stopRecording).toHaveBeenCalledTimes(1); // отправка действительно пошла
    fireEvent.press(getByLabelText('Отменить запись'));

    expect(onCancel).not.toHaveBeenCalled();
    expect(VideoNoteRecorderService.cancelRecording).not.toHaveBeenCalled();
  });

  it('окно закрыли посреди записи (экран ушёл из фокуса) — запись останавливается и выбрасывается', () => {
    VideoNoteRecorderService.isRecording.mockReturnValue(true);
    const { rerender } = render(
      <VideoNoteRecorder visible onComplete={jest.fn()} onCancel={jest.fn()} />,
    );
    VideoNoteRecorderService.cancelRecording.mockClear();
    rerender(<VideoNoteRecorder visible={false} onComplete={jest.fn()} onCancel={jest.fn()} />);
    expect(VideoNoteRecorderService.cancelRecording).toHaveBeenCalledTimes(1);
  });

  it('размонтирование посреди записи тоже останавливает её', () => {
    VideoNoteRecorderService.isRecording.mockReturnValue(true);
    const { unmount } = renderRecorder();
    VideoNoteRecorderService.cancelRecording.mockClear();
    unmount();
    expect(VideoNoteRecorderService.cancelRecording).toHaveBeenCalledTimes(1);
  });
});
