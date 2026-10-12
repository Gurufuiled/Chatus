import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
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
  return {
    CameraView: () => null,
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
    cancelRecording: jest.fn(() => Promise.resolve()),
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
