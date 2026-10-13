/**
 * Тесты VideoNoteBubble: перемотка кольцом и ползунок.
 * Запуск: npx jest src/components/VideoNoteBubble.test.tsx
 * Жесты и анимации подменены, поэтому тест вызывает обработчики жеста напрямую.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { VideoNoteBubble } from './VideoNoteBubble';

/* ───────────── моки ───────────── */

// Фейковый плеер: пишет журнал перемоток вместе с режимом плеера в момент перемотки.
jest.mock('expo-video', () => {
  const log: Array<{ seconds: number; scrubbing: boolean; tolerance: number }> = [];
  const player = {
    loop: false,
    playing: false,
    duration: 6,
    timeUpdateEventInterval: 0,
    seekToleranceValue: { toleranceBefore: 0, toleranceAfter: 0 },
    scrubbingValue: { scrubbingModeEnabled: false },
    _time: 0,
    get currentTime() {
      return this._time;
    },
    set currentTime(seconds: number) {
      this._time = seconds;
      log.push({
        seconds,
        scrubbing: Boolean(this.scrubbingValue.scrubbingModeEnabled),
        tolerance: this.seekToleranceValue.toleranceBefore ?? 0,
      });
    },
    get seekTolerance() {
      return this.seekToleranceValue;
    },
    set seekTolerance(v: { toleranceBefore?: number; toleranceAfter?: number }) {
      this.seekToleranceValue = { toleranceBefore: v.toleranceBefore ?? 0, toleranceAfter: v.toleranceAfter ?? 0 };
    },
    get scrubbingModeOptions() {
      return this.scrubbingValue;
    },
    set scrubbingModeOptions(v: { scrubbingModeEnabled?: boolean }) {
      this.scrubbingValue = { scrubbingModeEnabled: Boolean(v.scrubbingModeEnabled) };
    },
    play: jest.fn(),
    pause: jest.fn(),
    replay: jest.fn(),
  };
  return { useVideoPlayer: () => player, VideoView: () => null, __player: player, __log: log };
});
jest.mock('expo', () => ({
  useEvent: (_p: unknown, _e: string, init: unknown) => init,
  useEventListener: () => undefined,
}));
jest.mock('expo-video-thumbnails', () => ({
  getThumbnailAsync: jest.fn(() => Promise.resolve({ uri: '' })),
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@expo/vector-icons/Feather', () => () => null);
jest.mock('react-native-svg', () => ({ __esModule: true, default: () => null, Circle: () => null }));
jest.mock('../services/VoicePlayerService', () => ({
  VoicePlayerService: { stop: jest.fn(() => Promise.resolve()) },
}));
jest.mock('./MessageReactionInline', () => ({ MessageReactionInline: () => null }));
jest.mock('./MessageTimeStatus', () => ({ MessageTimeStatus: () => null }));
jest.mock('./OutgoingBubbleViewportGradient', () => ({
  OutgoingBubbleGradientShell: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    cancelAnimation: () => undefined,
    Easing: { out: (fn: unknown) => fn, inOut: (fn: unknown) => fn, cubic: () => 0, quad: () => 0, ease: () => 0 },
    interpolate: (v: number, input: number[], output: number[]) =>
      output[0] + ((v - input[0]) / (input[1] - input[0])) * (output[1] - output[0]),
    runOnJS: (fn: unknown) => fn,
    useAnimatedProps: (fn: () => unknown) => fn(),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    useFrameCallback: () => ({ setActive: () => undefined }),
    useSharedValue: (initial: unknown) => React.useRef({ value: initial }).current,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withTiming: (to: unknown) => to,
  };
});

// Жесты: записываем созданные Pan/Tap и их обработчики, чтобы вызывать их из теста.
jest.mock('react-native-gesture-handler', () => {
  const created: Array<{
    kind: string;
    handlers: Record<string, (...args: unknown[]) => void>;
    enabledValue: boolean;
  }> = [];
  const track = (kind: string) => {
    const rec = { kind, handlers: {} as Record<string, (...args: unknown[]) => void>, enabledValue: true };
    const proxy: unknown = new Proxy(rec, {
      get(target, prop) {
        if (prop in target) return (target as never)[prop];
        return (...args: unknown[]) => {
          if (prop === 'enabled') target.enabledValue = Boolean(args[0]);
          else if (typeof prop === 'string' && prop.startsWith('on')) {
            target.handlers[prop] = args[0] as (...a: unknown[]) => void;
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
      Simultaneous: (...g: unknown[]) => g,
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    __gestures: created,
  };
});

/* ───────────── помощники ───────────── */

type Player = {
  scrubbingValue: { scrubbingModeEnabled: boolean };
  seekToleranceValue: { toleranceBefore: number };
  _time: number;
};
const expoVideo = require('expo-video') as {
  __player: Player;
  __log: Array<{ seconds: number; scrubbing: boolean; tolerance: number }>;
};
const rngh = require('react-native-gesture-handler') as {
  __gestures: Array<{ kind: string; handlers: Record<string, (...args: unknown[]) => void>; enabledValue: boolean }>;
};

const lastGesture = (kind: string, enabledOnly = false) =>
  [...rngh.__gestures].reverse().find((g) => g.kind === kind && (!enabledOnly || g.enabledValue));

const tap = async () => {
  const gesture = lastGesture('tap');
  expect(gesture).toBeDefined();
  await act(async () => {
    gesture!.handlers.onEnd({}, true);
    await jest.advanceTimersByTimeAsync(20);
  });
};

const advance = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

/** Точка на кольце: доля 0…1 по часовой стрелке от 12 часов. Радиус 130 попадает в «полосу» кольца. */
const ringPoint = (fraction: number) => {
  const center = 156; // EXPANDED_SIZE/2 в jest (ширина окна велика → 312/2)
  const angle = fraction * Math.PI * 2 - Math.PI / 2;
  return { x: center + 130 * Math.cos(angle), y: center + 130 * Math.sin(angle) };
};

const renderBubble = () =>
  render(<VideoNoteBubble uri="file:///note.mp4" durationMs={6000} isMe={false} time="12:00" />);

beforeEach(() => {
  jest.useFakeTimers();
  rngh.__gestures.length = 0;
  expoVideo.__log.length = 0;
  expoVideo.__player._time = 0;
  expoVideo.__player.scrubbingValue = { scrubbingModeEnabled: false };
  expoVideo.__player.seekToleranceValue = { toleranceBefore: 0 };
});

afterEach(() => {
  jest.useRealTimers();
});

/* ───────────── тесты ───────────── */

describe('ползунок кольца', () => {
  it('в свёрнутом кружке ползунка нет', () => {
    const { queryByTestId } = renderBubble();
    expect(queryByTestId('video-note-scrub-thumb')).toBeNull();
  });

  it('регрессия: после раскрытия ползунок уже в дереве — при паузе он не создаётся заново (иначе мелькал в центре)', async () => {
    const { queryByTestId } = renderBubble();
    await tap(); // раскрыли и играем
    const playingThumb = queryByTestId('video-note-scrub-thumb');
    expect(playingThumb).not.toBeNull();

    await tap(); // пауза
    const pausedThumb = queryByTestId('video-note-scrub-thumb');
    expect(pausedThumb).not.toBeNull();
    // тот же самый узел, а не вновь смонтированный
    expect(pausedThumb).toBe(playingThumb);
  });

  it('стартовая позиция ползунка — на кольце, а не в центре (смещение задано сразу)', async () => {
    const { getByTestId } = renderBubble();
    await tap();
    const style = (getByTestId('video-note-scrub-thumb').props.style as unknown[]).flat(Infinity) as Array<
      Record<string, unknown>
    >;
    const transform = style.find((s) => s && 'transform' in s)?.transform as Array<Record<string, number>>;
    expect(transform).toBeDefined();
    const dx = transform.find((t) => 'translateX' in t)?.translateX;
    const dy = transform.find((t) => 'translateY' in t)?.translateY;
    // 12 часов: по горизонтали 0, по вертикали — вверх на радиус кольца (не 0,0 как в центре)
    expect(dx).toBeCloseTo(0, 5);
    expect(dy!).toBeLessThan(-50);
  });
});

describe('перемотка кольцом', () => {
  const startPaused = async () => {
    const utils = renderBubble();
    await tap(); // играет
    await tap(); // пауза → включается жест перемотки
    return utils;
  };

  const touchRing = async (fraction: number) => {
    const pan = lastGesture('pan', true);
    expect(pan).toBeDefined();
    const point = ringPoint(fraction);
    const stateManager = { fail: jest.fn() };
    await act(async () => {
      pan!.handlers.onTouchesDown({ allTouches: [point] }, stateManager);
    });
    expect(stateManager.fail).not.toHaveBeenCalled();
    await act(async () => {
      pan!.handlers.onStart(point);
    });
    return pan!;
  };

  it('на кольце жест перемотки включается только на паузе', async () => {
    renderBubble();
    await tap(); // играет
    expect(lastGesture('pan', true)).toBeUndefined();
    await tap(); // пауза
    expect(lastGesture('pan', true)).toBeDefined();
  });

  it('начало перетаскивания включает быстрый режим плеера (скраббинг + допуск) и сразу показывает кадр', async () => {
    await startPaused();
    await touchRing(0.25);
    expect(expoVideo.__player.scrubbingValue.scrubbingModeEnabled).toBe(true);
    expect(expoVideo.__player.seekToleranceValue.toleranceBefore).toBeGreaterThan(0);
    // 0.25 от 6 секунд = 1.5 с — первая перемотка без задержки
    expect(expoVideo.__log[expoVideo.__log.length - 1]).toMatchObject({ seconds: 1.5, scrubbing: true });
  });

  it('регрессия: во время перетаскивания перемотки идут чаще, чем раз в 90 мс', async () => {
    await startPaused();
    const pan = await touchRing(0);
    expoVideo.__log.length = 0;

    // палец движется по кольцу 400 мс, событие каждые 10 мс
    for (let i = 1; i <= 40; i += 1) {
      await act(async () => {
        pan.handlers.onUpdate(ringPoint(i / 80));
        await jest.advanceTimersByTimeAsync(10);
      });
    }
    await advance(100);
    // раньше за 400 мс было не больше ~5 перемоток
    expect(expoVideo.__log.length).toBeGreaterThanOrEqual(9);
    // все перемотки — в быстром режиме
    expect(expoVideo.__log.every((e) => e.scrubbing)).toBe(true);
  });

  it('последняя позиция не теряется, даже если палец остановился сразу после перемотки', async () => {
    await startPaused();
    const pan = await touchRing(0);
    await act(async () => {
      pan.handlers.onUpdate(ringPoint(0.2));
      await jest.advanceTimersByTimeAsync(5);
      pan.handlers.onUpdate(ringPoint(0.5)); // последнее движение, дальше палец неподвижен
    });
    await advance(300);
    expect(expoVideo.__player._time).toBeCloseTo(3, 1); // 0.5 × 6 с
  });

  it('при отпускании: быстрый режим выключается, допуск 0 и одна точная перемотка в конечную позицию', async () => {
    await startPaused();
    const pan = await touchRing(0.25);
    await act(async () => {
      pan.handlers.onUpdate(ringPoint(0.75));
      await jest.advanceTimersByTimeAsync(100);
    });
    expoVideo.__log.length = 0;

    await act(async () => {
      pan.handlers.onFinalize();
    });
    await advance(50);

    expect(expoVideo.__player.scrubbingValue.scrubbingModeEnabled).toBe(false);
    expect(expoVideo.__player.seekToleranceValue.toleranceBefore).toBe(0);
    // ровно одна перемотка, уже в точном режиме, в позицию 0.75 × 6 = 4.5 с
    expect(expoVideo.__log).toHaveLength(1);
    expect(expoVideo.__log[0]).toMatchObject({ seconds: 4.5, scrubbing: false, tolerance: 0 });
  });

  it('отложенная «хвостовая» перемотка не срабатывает после отпускания', async () => {
    await startPaused();
    const pan = await touchRing(0);
    await act(async () => {
      pan.handlers.onUpdate(ringPoint(0.1));
      await jest.advanceTimersByTimeAsync(3);
      pan.handlers.onUpdate(ringPoint(0.6)); // будет отложена
      pan.handlers.onFinalize();
    });
    expoVideo.__log.length = 0;
    await advance(500);
    expect(expoVideo.__log).toHaveLength(0);
  });

  it('касание в центре (кнопка пауза/старт) не запускает перемотку', async () => {
    await startPaused();
    const pan = lastGesture('pan', true)!;
    const stateManager = { fail: jest.fn() };
    await act(async () => {
      pan.handlers.onTouchesDown({ allTouches: [{ x: 156, y: 156 }] }, stateManager);
    });
    expect(stateManager.fail).toHaveBeenCalled();
    expect(expoVideo.__player.scrubbingValue.scrubbingModeEnabled).toBe(false);
  });

  it('касание вне кольца не запускает перемотку', async () => {
    await startPaused();
    const pan = lastGesture('pan', true)!;
    const stateManager = { fail: jest.fn() };
    await act(async () => {
      pan.handlers.onTouchesDown({ allTouches: [{ x: 2, y: 2 }] }, stateManager);
    });
    expect(stateManager.fail).toHaveBeenCalled();
  });

  it('отпускание без перетаскивания (просто касание) не перематывает и не трогает режим плеера', async () => {
    await startPaused();
    const pan = lastGesture('pan', true)!;
    expoVideo.__log.length = 0;
    await act(async () => {
      pan.handlers.onFinalize();
    });
    expect(expoVideo.__log).toHaveLength(0);
    expect(expoVideo.__player.scrubbingValue.scrubbingModeEnabled).toBe(false);
  });

  it('если кружок исчез посреди перетаскивания, плеер не остаётся в режиме скраббинга', async () => {
    const { unmount } = await startPaused();
    await touchRing(0.3);
    expect(expoVideo.__player.scrubbingValue.scrubbingModeEnabled).toBe(true);
    unmount();
    expect(expoVideo.__player.scrubbingValue.scrubbingModeEnabled).toBe(false);
    expect(expoVideo.__player.seekToleranceValue.toleranceBefore).toBe(0);
  });
});
