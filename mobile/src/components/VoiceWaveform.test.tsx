/**
 * Дорожка голосового: число столбиков по ширине, прогресс, перемотка тапом и перетаскиванием.
 * Запуск: npx jest src/components/VoiceWaveform.test.tsx
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { VoiceWaveform } from './VoiceWaveform';

// Жесты: записываем созданные Pan/Tap и их обработчики, чтобы вызывать их из теста.
jest.mock('react-native-gesture-handler', () => {
  const created: Array<{
    kind: string;
    handlers: Record<string, (...args: unknown[]) => void>;
    enabledValue: boolean;
    config: Record<string, unknown>;
  }> = [];
  const track = (kind: string) => {
    const rec = {
      kind,
      handlers: {} as Record<string, (...args: unknown[]) => void>,
      enabledValue: true,
      config: {} as Record<string, unknown>,
    };
    const proxy: unknown = new Proxy(rec, {
      get(target, prop) {
        if (prop in target) return (target as never)[prop];
        return (...args: unknown[]) => {
          if (prop === 'enabled') target.enabledValue = Boolean(args[0]);
          else if (typeof prop === 'string' && prop.startsWith('on')) {
            target.handlers[prop] = args[0] as (...a: unknown[]) => void;
          } else if (typeof prop === 'string') {
            target.config[prop] = args.length === 1 ? args[0] : args;
          }
          return proxy;
        };
      },
    });
    created.push(rec);
    return proxy;
  };
  return {
    Gesture: {
      Pan: () => track('pan'),
      Tap: () => track('tap'),
      Exclusive: (...g: unknown[]) => g,
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    __gestures: created,
  };
});

const rngh = require('react-native-gesture-handler') as {
  __gestures: Array<{
    kind: string;
    handlers: Record<string, (...args: unknown[]) => void>;
    enabledValue: boolean;
    config: Record<string, unknown>;
  }>;
};
const lastGesture = (kind: string) => [...rngh.__gestures].reverse().find((g) => g.kind === kind)!;

const PLAYED = '#112233';
const UNPLAYED = '#aabbcc';
const wave = Array.from({ length: 100 }, (_, i) => ((i * 37) % 100) / 100);

const baseProps = {
  waveform: wave,
  seed: 'voice-1',
  durationMs: 10_000,
  progress: 0,
  playedColor: PLAYED,
  unplayedColor: UNPLAYED,
};

const layout = (node: ReturnType<ReturnType<typeof render>['getByTestId']>, width: number) =>
  fireEvent(node, 'layout', { nativeEvent: { layout: { width, height: 28, x: 0, y: 0 } } });

const bars = (node: { children: unknown[] }) =>
  node.children.filter((c) => typeof c !== 'string') as Array<{ props: { style: unknown } }>;
const colorOf = (bar: { props: { style: unknown } }) =>
  (StyleSheet.flatten(bar.props.style as never) as { backgroundColor?: string }).backgroundColor;
const heightOf = (bar: { props: { style: unknown } }) =>
  (StyleSheet.flatten(bar.props.style as never) as { height?: number }).height as number;

describe('VoiceWaveform: столбики', () => {
  it('до измерения ширины рисует запасное число столбиков', () => {
    const { getByTestId } = render(<VoiceWaveform {...baseProps} testID="wf" />);
    expect(bars(getByTestId('wf') as never)).toHaveLength(40);
  });

  it('после измерения число столбиков зависит от ширины (шаг 4 px)', () => {
    const { getByTestId } = render(<VoiceWaveform {...baseProps} testID="wf" />);
    layout(getByTestId('wf'), 182);
    expect(bars(getByTestId('wf') as never)).toHaveLength(46);
    layout(getByTestId('wf'), 120);
    expect(bars(getByTestId('wf') as never)).toHaveLength(30);
  });

  it('нулевая ширина из layout игнорируется', () => {
    const { getByTestId } = render(<VoiceWaveform {...baseProps} testID="wf" />);
    layout(getByTestId('wf'), 182);
    layout(getByTestId('wf'), 0);
    expect(bars(getByTestId('wf') as never)).toHaveLength(46);
  });

  it('столбики тонкие и скруглённые, высота в пределах дорожки', () => {
    const { getByTestId } = render(<VoiceWaveform {...baseProps} testID="wf" />);
    for (const bar of bars(getByTestId('wf') as never)) {
      const flat = StyleSheet.flatten(bar.props.style as never) as { width: number; borderRadius: number; height: number };
      expect(flat.width).toBe(2);
      expect(flat.borderRadius).toBe(1);
      expect(flat.height).toBeGreaterThanOrEqual(2);
      expect(flat.height).toBeLessThanOrEqual(22);
    }
  });

  it('тишина (нулевая дорожка) — ровные низкие точки, а не «крик»', () => {
    const { getByTestId } = render(
      <VoiceWaveform {...baseProps} waveform={Array(100).fill(0.002)} testID="wf" />,
    );
    const heights = bars(getByTestId('wf') as never).map(heightOf);
    expect(Math.max(...heights)).toBeLessThan(5);
    expect(new Set(heights).size).toBe(1);
  });

  it('без данных о громкости рисуется условная дорожка, одинаковая для одного голосового', () => {
    const a = render(<VoiceWaveform {...baseProps} waveform={[]} testID="wf" />);
    const b = render(<VoiceWaveform {...baseProps} waveform={[]} testID="wf" />);
    const ha = bars(a.getByTestId('wf') as never).map(heightOf);
    const hb = bars(b.getByTestId('wf') as never).map(heightOf);
    expect(ha).toEqual(hb);
    expect(new Set(ha).size).toBeGreaterThan(5);
  });
});

describe('VoiceWaveform: прогресс', () => {
  it('закрашивает пройденную долю столбиков', () => {
    const { getByTestId } = render(<VoiceWaveform {...baseProps} progress={0.5} testID="wf" />);
    layout(getByTestId('wf'), 182); // 46 столбиков
    const colors = bars(getByTestId('wf') as never).map(colorOf);
    expect(colors.filter((c) => c === PLAYED)).toHaveLength(23);
    expect(colors.slice(0, 23).every((c) => c === PLAYED)).toBe(true);
    expect(colors.slice(23).every((c) => c === UNPLAYED)).toBe(true);
  });

  it('нулевой прогресс — всё не закрашено', () => {
    const { getByTestId } = render(<VoiceWaveform {...baseProps} progress={0} testID="wf" />);
    expect(bars(getByTestId('wf') as never).map(colorOf).every((c) => c === UNPLAYED)).toBe(true);
  });

  it('доступность: значение отражает прогресс', () => {
    const { getByTestId } = render(<VoiceWaveform {...baseProps} progress={0.25} testID="wf" />);
    expect(getByTestId('wf').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 25 });
  });
});

describe('VoiceWaveform: перемотка', () => {
  const setup = (extra: Partial<React.ComponentProps<typeof VoiceWaveform>> = {}) => {
    const onSeek = jest.fn();
    const onScrub = jest.fn();
    const utils = render(<VoiceWaveform {...baseProps} testID="wf" onSeek={onSeek} onScrub={onScrub} {...extra} />);
    layout(utils.getByTestId('wf'), 200);
    return { ...utils, onSeek, onScrub };
  };

  it('тап по дорожке переходит в эту точку', () => {
    const { onSeek } = setup();
    act(() => {
      lastGesture('tap').handlers.onEnd({ x: 50 }, true);
    });
    expect(onSeek).toHaveBeenCalledWith(0.25);
  });

  it('прерванный тап ничего не делает', () => {
    const { onSeek } = setup();
    act(() => {
      lastGesture('tap').handlers.onEnd({ x: 50 }, false);
    });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('перетаскивание: столбики следуют за пальцем, а перемотка — только при отпускании', () => {
    const { getByTestId, onSeek, onScrub } = setup();
    const pan = lastGesture('pan');

    act(() => pan.handlers.onStart({ x: 40 }));
    expect(onScrub).toHaveBeenLastCalledWith(0.2);
    expect(bars(getByTestId('wf') as never).map(colorOf).filter((c) => c === PLAYED).length).toBeGreaterThan(0);

    act(() => pan.handlers.onUpdate({ x: 150 }));
    expect(onScrub).toHaveBeenLastCalledWith(0.75);
    const filled = bars(getByTestId('wf') as never).map(colorOf).filter((c) => c === PLAYED).length;
    expect(filled).toBeGreaterThanOrEqual(37); // ~75% из 50 столбиков

    expect(onSeek).not.toHaveBeenCalled(); // пока палец на дорожке, воспроизведение не дёргается

    act(() => pan.handlers.onEnd({ x: 150 }, true));
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(0.75);

    act(() => pan.handlers.onFinalize());
    expect(onScrub).toHaveBeenLastCalledWith(null);
    // после жеста закраска возвращается к реальному прогрессу
    expect(bars(getByTestId('wf') as never).map(colorOf).every((c) => c === UNPLAYED)).toBe(true);
  });

  it('палец ушёл за края — доля обрезается до 0..1', () => {
    const { onSeek } = setup();
    const pan = lastGesture('pan');
    act(() => pan.handlers.onStart({ x: 100 }));
    act(() => pan.handlers.onEnd({ x: -80 }, true));
    expect(onSeek).toHaveBeenLastCalledWith(0);
    act(() => pan.handlers.onEnd({ x: 999 }, true));
    expect(onSeek).toHaveBeenLastCalledWith(1);
  });

  it('жест отменён системой (например, ушёл в свайп «ответить») — перемотки нет', () => {
    const { onSeek, onScrub } = setup();
    const pan = lastGesture('pan');
    act(() => pan.handlers.onStart({ x: 80 }));
    act(() => pan.handlers.onEnd({ x: 80 }, false));
    act(() => pan.handlers.onFinalize());
    expect(onSeek).not.toHaveBeenCalled();
    expect(onScrub).toHaveBeenLastCalledWith(null);
  });

  it('мелкие движения внутри одного столбика не перерисовывают и не спамят onScrub', () => {
    const { onScrub } = setup();
    const pan = lastGesture('pan');
    act(() => pan.handlers.onStart({ x: 98 }));
    const calls = onScrub.mock.calls.length;
    act(() => pan.handlers.onUpdate({ x: 98.4 }));
    act(() => pan.handlers.onUpdate({ x: 98.8 }));
    expect(onScrub.mock.calls.length).toBe(calls);
    act(() => pan.handlers.onUpdate({ x: 130 }));
    expect(onScrub.mock.calls.length).toBe(calls + 1);
  });

  it('правила жестов: перетаскивание активируется по горизонтали раньше свайпа «ответить», вертикаль отдаётся списку', () => {
    setup();
    const pan = lastGesture('pan');
    expect(pan.config.activeOffsetX).toEqual([-8, 8]); // у свайпа «ответить» порог 12
    expect(pan.config.failOffsetY).toEqual([-12, 12]);
    expect(pan.config.runOnJS).toBe(true);
  });

  it('отключённая дорожка (голосовое грузится) не реагирует на жесты', () => {
    setup({ disabled: true });
    expect(lastGesture('pan').enabledValue).toBe(false);
    expect(lastGesture('tap').enabledValue).toBe(false);
  });
});
