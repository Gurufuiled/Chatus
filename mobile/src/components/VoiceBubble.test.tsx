/**
 * Пузырь голосового: запуск с ключом сообщения (для верхней плашки), перемотка по дорожке, время при перетаскивании.
 * Запуск: npx jest src/components/VoiceBubble.test.tsx
 */
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { VoiceBubble } from './VoiceBubble';

const mockPlay = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockPause = jest.fn(() => Promise.resolve());
const mockSeekTo = jest.fn((_ms: number) => Promise.resolve());
const mockStopVideoNote = jest.fn();
const mockPlayback = {
  isCurrent: false,
  isPlaying: false,
  progress: 0,
  positionMs: 0,
  remainingMs: 10_000,
  rate: 1,
};
let mockWaveformProps: Record<string, unknown> = {};

jest.mock('../contexts/VoicePlayerContext', () => ({
  useVoicePlayerControls: () => ({ play: mockPlay, pause: mockPause, seekTo: mockSeekTo }),
  useVoicePlaybackForUri: () => mockPlayback,
}));
jest.mock('./VideoNoteBubble', () => ({ stopActiveVideoNotePlayback: () => mockStopVideoNote() }));
const mockReactionProps: Array<Record<string, unknown>> = [];
jest.mock('./MessageReactionInline', () => ({
  MessageReactionInline: (props: Record<string, unknown>) => {
    const { View } = require('react-native');
    mockReactionProps.push(props);
    return <View testID="reactions-mock" />;
  },
}));
jest.mock('./MessageTimeStatus', () => ({
  MessageTimeStatus: ({ time }: { time: string }) => {
    const { Text } = require('react-native');
    return <Text testID="time-mock">{time}</Text>;
  },
}));
jest.mock('./AnimatedPlayPauseIcon', () => ({ AnimatedPlayPauseIcon: () => null }));
jest.mock('@expo/vector-icons/Feather', () => 'Feather');
jest.mock('react-native-gesture-handler', () => {
  const { Pressable } = require('react-native');
  return { Pressable };
});
// сама дорожка проверяется в VoiceWaveform.test.tsx — здесь важно, что пузырь ей передаёт и как реагирует
jest.mock('./VoiceWaveform', () => ({
  VoiceWaveform: (props: Record<string, unknown>) => {
    mockWaveformProps = props;
    return null;
  },
}));

const baseProps = {
  uri: 'file:///voice.m4a',
  waveform: [0.1, 0.5, 0.9],
  durationMs: 10_000,
  isMe: false,
  messageKey: 'msg-1',
};

beforeEach(() => {
  mockPlay.mockClear();
  mockPause.mockClear();
  mockSeekTo.mockClear();
  mockStopVideoNote.mockClear();
  Object.assign(mockPlayback, { isCurrent: false, isPlaying: false, progress: 0, positionMs: 0, remainingMs: 10_000 });
  mockWaveformProps = {};
  mockReactionProps.length = 0;
});

describe('VoiceBubble: запуск', () => {
  it('кнопка воспроизведения передаёт ключ сообщения (по нему находится верхняя плашка)', () => {
    const { getByLabelText } = render(<VoiceBubble {...baseProps} />);
    fireEvent.press(getByLabelText('Play voice message'));
    expect(mockPlay).toHaveBeenCalledWith('file:///voice.m4a', undefined, 'msg-1');
    expect(mockStopVideoNote).toHaveBeenCalled(); // голосовое прерывает играющий кружок
  });

  it('во время воспроизведения кнопка ставит на паузу', () => {
    Object.assign(mockPlayback, { isCurrent: true, isPlaying: true, progress: 0.3 });
    const { getByLabelText } = render(<VoiceBubble {...baseProps} />);
    fireEvent.press(getByLabelText('Pause voice message'));
    expect(mockPause).toHaveBeenCalled();
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('пока голосовое грузится, нажатие ничего не запускает', () => {
    const { getByLabelText } = render(<VoiceBubble {...baseProps} loading />);
    fireEvent.press(getByLabelText('Voice message is loading'));
    expect(mockPlay).not.toHaveBeenCalled();
  });
});

describe('VoiceBubble: дорожка', () => {
  it('передаёт дорожке данные и прогресс только если это играющее сообщение', () => {
    render(<VoiceBubble {...baseProps} />);
    expect(mockWaveformProps.waveform).toEqual([0.1, 0.5, 0.9]);
    expect(mockWaveformProps.durationMs).toBe(10_000);
    expect(mockWaveformProps.progress).toBe(0);

    Object.assign(mockPlayback, { isCurrent: true, isPlaying: true, progress: 0.4 });
    render(<VoiceBubble {...baseProps} />);
    expect(mockWaveformProps.progress).toBe(0.4);
  });

  it('перемотка другого голосового запускает его с выбранной точки (и с ключом)', () => {
    render(<VoiceBubble {...baseProps} />);
    act(() => (mockWaveformProps.onSeek as (r: number) => void)(0.5));
    expect(mockPlay).toHaveBeenCalledWith('file:///voice.m4a', 5000, 'msg-1');
    expect(mockSeekTo).not.toHaveBeenCalled();
    expect(mockStopVideoNote).toHaveBeenCalled();
  });

  it('перемотка играющего голосового просто переводит позицию', () => {
    Object.assign(mockPlayback, { isCurrent: true, isPlaying: true, progress: 0.1 });
    render(<VoiceBubble {...baseProps} />);
    act(() => (mockWaveformProps.onSeek as (r: number) => void)(0.8));
    expect(mockSeekTo).toHaveBeenCalledWith(8000);
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('доля за пределами 0..1 обрезается', () => {
    Object.assign(mockPlayback, { isCurrent: true });
    render(<VoiceBubble {...baseProps} />);
    act(() => (mockWaveformProps.onSeek as (r: number) => void)(3));
    expect(mockSeekTo).toHaveBeenLastCalledWith(10_000);
    act(() => (mockWaveformProps.onSeek as (r: number) => void)(-1));
    expect(mockSeekTo).toHaveBeenLastCalledWith(0);
  });

  it('пока голосовое грузится или нет адреса, дорожка отключена и перемотка не работает', () => {
    render(<VoiceBubble {...baseProps} loading />);
    expect(mockWaveformProps.disabled).toBe(true);
    act(() => (mockWaveformProps.onSeek as (r: number) => void)(0.5));
    expect(mockPlay).not.toHaveBeenCalled();

    render(<VoiceBubble {...baseProps} uri={null} />);
    expect(mockWaveformProps.disabled).toBe(true);
  });

  it('при перетаскивании время рядом показывает оставшееся от точки под пальцем', () => {
    const { getByText, queryByText } = render(<VoiceBubble {...baseProps} durationMs={10_000} />);
    expect(getByText('0:10')).toBeTruthy();
    act(() => (mockWaveformProps.onScrub as (r: number | null) => void)(0.5));
    expect(getByText('0:05')).toBeTruthy();
    expect(queryByText('0:10')).toBeNull();
    act(() => (mockWaveformProps.onScrub as (r: number | null) => void)(null));
    expect(getByText('0:10')).toBeTruthy();
  });

  it('цвета: у своих — цвет текста исходящих, у чужих — синий и серый', () => {
    render(<VoiceBubble {...baseProps} isMe={false} />);
    expect(mockWaveformProps.playedColor).toBe('#4A8FF5');
    expect(mockWaveformProps.unplayedColor).toBe('#D2D5DA');
    render(<VoiceBubble {...baseProps} isMe outgoingTextColor="#102030" />);
    expect(mockWaveformProps.playedColor).toBe('#102030');
    expect(String(mockWaveformProps.unplayedColor)).not.toBe('#102030'); // приглушённый
  });
});

type TreeNode = { parent: TreeNode | null; props: { testID?: string; style?: unknown }; children: unknown[] };
const hasAncestorWithTestId = (node: TreeNode, testID: string): boolean => {
  for (let current: TreeNode | null = node.parent; current; current = current.parent) {
    if (current.props?.testID === testID) return true;
  }
  return false;
};

describe('VoiceBubble: реакции и время (как в Telegram)', () => {
  const reactions = [{ emoji: '❤️', count: 1, reacted_by_me: false }];

  it('без реакций время стоит в одной строке с длительностью, отдельной строки реакций нет', () => {
    const { queryByTestId, getByTestId } = render(<VoiceBubble {...baseProps} time="00:28" />);
    expect(queryByTestId('voice-bubble-reactions-row')).toBeNull();
    expect(getByTestId('time-mock')).toBeTruthy();
  });

  it('с реакциями: внизу отдельная строка — реакция слева, время справа; время не дублируется', () => {
    const { getByTestId, getAllByTestId } = render(
      <VoiceBubble {...baseProps} time="00:28" inlineReactions={reactions} />,
    );
    const row = getByTestId('voice-bubble-reactions-row');
    expect(getAllByTestId('time-mock')).toHaveLength(1);
    expect(hasAncestorWithTestId(getByTestId('time-mock') as never, 'voice-bubble-reactions-row')).toBe(true);
    expect(hasAncestorWithTestId(getByTestId('reactions-mock') as never, 'voice-bubble-reactions-row')).toBe(true);

    // порядок в строке: сначала реакции (слева), потом время (справа)
    const [left, right] = (row.children as TreeNode[]).filter((c) => typeof c !== 'string');
    expect(StyleSheet.flatten(left.props.style as never)).toMatchObject({ flexShrink: 1 });
    expect(StyleSheet.flatten(row.props.style as never)).toMatchObject({
      flexDirection: 'row',
      justifyContent: 'space-between',
    });
    expect(right).toBeTruthy();
  });

  it('реакция в строке — компактная таблетка, прижатая влево', () => {
    render(<VoiceBubble {...baseProps} inlineReactions={reactions} />);
    expect(mockReactionProps.length).toBeGreaterThan(0);
    expect(mockReactionProps.every((p) => p.variant === 'floatingTail' && p.tailAlign === 'start')).toBe(true);
  });

  it('строка реакций лежит под основной строкой (кнопка + дорожка) на всю ширину пузыря, а не в колонке дорожки', () => {
    const { getByTestId } = render(<VoiceBubble {...baseProps} inlineReactions={reactions} />);
    const row = getByTestId('voice-bubble-reactions-row') as unknown as TreeNode;
    // поднимаемся от строки реакций до самого пузыря (колонка с отступами 10); колонку дорожки (flex: 1) миновать нельзя
    let reachedBubble = false;
    for (let node: TreeNode | null = row.parent; node; node = node.parent) {
      const style = (StyleSheet.flatten(node.props?.style as never) ?? {}) as Record<string, unknown>;
      expect(style.flex === 1 && style.minWidth === 0).toBe(false);
      if (style.paddingHorizontal === 10) {
        reachedBubble = true;
        break;
      }
    }
    expect(reachedBubble).toBe(true);
  });

  it('реакция нажимается: событие уходит наверх', () => {
    const onToggle = jest.fn();
    render(
      <VoiceBubble {...baseProps} inlineReactions={reactions} allowMessageReactions onToggleInlineReaction={onToggle} />,
    );
    (mockReactionProps[0].onToggle as (emoji: string) => void)('❤️');
    expect(onToggle).toHaveBeenCalledWith('❤️');
    expect(mockReactionProps[0].allowReactions).toBe(true);
  });
});

describe('VoiceBubble: ширина зависит от длительности (регрессия: всегда был максимальный)', () => {
  beforeAll(() => {
    // экран обычного телефона: иначе в тестовом окружении (750 px) оба пузыря упираются в предел 290
    Dimensions.set({ window: { width: 411, height: 850, scale: 2.6, fontScale: 1 } });
  });
  const rootWidth = (utils: ReturnType<typeof render>) =>
    (StyleSheet.flatten((utils.toJSON() as { props: { style: unknown } }).props.style as never) as { width?: number | string }).width;

  it('короткое голосовое уже длинного', () => {
    const short = rootWidth(render(<VoiceBubble {...baseProps} durationMs={9_000} />)) as number;
    const long = rootWidth(render(<VoiceBubble {...baseProps} durationMs={60_000} />)) as number;
    expect(typeof short).toBe('number');
    expect(short).toBeLessThan(long);
    expect(long - short).toBeGreaterThan(40);
  });

  it('во вложенном виде (ответ) ширину задаёт родитель', () => {
    expect(rootWidth(render(<VoiceBubble {...baseProps} embedded durationMs={9_000} />))).toBe('100%');
  });
});
