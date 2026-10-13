import React from 'react';
import { Animated, View } from 'react-native';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { composerPresentation } from '../presentation';
import { InputVoiceRecordingStage } from './InputVoiceRecordingStage';

jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: require('../theme/palettes').getPaletteForScheme('light'),
    resolvedScheme: 'light',
  }),
}));

jest.mock('@expo/vector-icons/Feather', () => () => null);
jest.mock('../services/VoiceRecorderService', () => ({
  VoiceRecorderService: { subscribeToLiveWaveform: jest.fn(() => () => undefined) },
}));

const anim = new Animated.Value(0);
const makeProps = () => ({
  recordingStartedAtMs: Date.now(),
  voiceTouchTracking: false,
  panHandlers: {},
  recordingBubbleStyle: {},
  recordingBubbleCancelTintStyle: {},
  recordingLiveContentStyle: { opacity: anim },
  recordingCancelContentStyle: { opacity: anim },
  onCancel: jest.fn(),
  onSend: jest.fn(),
});

describe('InputVoiceRecordingStage', () => {
  // бесконечные анимации (мерцание/пульс) не должны тикать во время теста
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('пока палец держит: целая подсказка «Влево — отмена», без волны', () => {
    const { getByText, queryByTestId } = render(
      <InputVoiceRecordingStage {...makeProps()} isLocked={false} />,
    );
    expect(getByText('Влево — отмена')).toBeTruthy();
    expect(queryByTestId('voice-recording-waveform')).toBeNull();
  });

  it('после блокировки: волна и кнопка отправки, подсказки нет', () => {
    const { queryByText, getByTestId, getByLabelText } = render(
      <InputVoiceRecordingStage {...makeProps()} isLocked />,
    );
    expect(queryByText('Влево — отмена')).toBeNull();
    expect(getByTestId('voice-recording-waveform')).toBeTruthy();
    expect(getByLabelText('Send voice message')).toBeTruthy();
    expect(getByLabelText('Delete recording')).toBeTruthy();
  });

  it('таймер стартует с 0:00', () => {
    const { getByText } = render(<InputVoiceRecordingStage {...makeProps()} isLocked={false} />);
    expect(getByText('0:00')).toBeTruthy();
  });

  it('надпись «ОТМЕНА» всегда в дереве, но прозрачна в начале жеста (кроссфейд управляется стилем)', () => {
    const { getByText } = render(<InputVoiceRecordingStage {...makeProps()} isLocked={false} />);
    expect(getByText('ОТМЕНА')).toBeTruthy();
  });

  it('регрессия: высота панели записи ровно равна высоте обычной панели ввода (нет рывка списка при старте записи)', () => {
    for (const isLocked of [false, true]) {
      const { getByTestId, unmount } = render(
        <InputVoiceRecordingStage {...makeProps()} isLocked={isLocked} />,
      );
      const stage = StyleSheet.flatten(getByTestId('voice-recording-stage').props.style) as {
        height?: number;
        minHeight?: number;
      };
      // фиксированная высота, а не minHeight: кнопка записи (58) выше панели (54) и не должна её растягивать
      expect(stage.height).toBe(composerPresentation.shellMinHeight);
      unmount();
    }
  });
});
