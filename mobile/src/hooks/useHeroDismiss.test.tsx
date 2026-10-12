import { act, renderHook } from '@testing-library/react-native';
import { useHeroDismiss } from './useHeroDismiss';

// Нативная часть Reanimated/Worklets в jest недоступна — подменяем только то, что использует хук.
// withTiming/withSpring завершаются сразу и вызывают колбэк, как будто анимация закончилась.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  return {
    Easing: { out: (fn: unknown) => fn, cubic: () => 0 },
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useSharedValue: (initial: number) => React.useRef({ value: initial }).current,
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withTiming: (to: number, _cfg?: unknown, cb?: (finished: boolean) => void) => {
      cb?.(true);
      return to;
    },
    withSpring: (to: number) => to,
    withDelay: (_ms: number, value: number) => value,
  };
});

// Цепочка конфигурации жеста нам не важна — только что хук её строит без ошибок.
jest.mock('react-native-gesture-handler', () => {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, { get: () => () => self });
  return { Gesture: { Pan: () => self } };
});

jest.useFakeTimers();

const flush = async () => {
  await act(async () => {
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
  });
};

describe('useHeroDismiss', () => {
  it('возвращает жест, стили и requestClose', () => {
    const { result } = renderHook(() =>
      useHeroDismiss({
        visible: true,
        getSourceRect: () => Promise.resolve(null),
        onDismiss: jest.fn(),
      }),
    );
    expect(result.current.gesture).toBeTruthy();
    expect(result.current.contentStyle).toBeDefined();
    expect(result.current.backdropStyle).toBeDefined();
    expect(result.current.chromeStyle).toBeDefined();
    expect(typeof result.current.requestClose).toBe('function');
  });

  it('requestClose без миниатюры всё равно закрывает фото (onDismiss вызван один раз)', async () => {
    const onDismiss = jest.fn();
    const { result } = renderHook(() =>
      useHeroDismiss({
        visible: true,
        getSourceRect: () => Promise.resolve(null),
        onDismiss,
      }),
    );
    await flush();
    act(() => result.current.requestClose());
    await flush();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('повторное нажатие «закрыть» во время анимации не вызывает onDismiss дважды', async () => {
    const onDismiss = jest.fn();
    const { result } = renderHook(() =>
      useHeroDismiss({
        visible: true,
        getSourceRect: () => Promise.resolve(null),
        onDismiss,
      }),
    );
    await flush();
    act(() => {
      result.current.requestClose();
      result.current.requestClose();
    });
    await flush();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('не закрывает, пока вьювер не показан', async () => {
    const onDismiss = jest.fn();
    renderHook(() =>
      useHeroDismiss({
        visible: false,
        getSourceRect: () => Promise.resolve(null),
        onDismiss,
      }),
    );
    await flush();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  describe('посадка на миниатюру', () => {
    const tile = { x: 20, y: 100, width: 100, height: 100 };

    const setup = (onDismiss = jest.fn()) =>
      renderHook(() =>
        useHeroDismiss({
          visible: true,
          getSourceRect: () => Promise.resolve(tile),
          getHeroImageUri: () => 'file:///photo.jpg',
          getImageSize: () => ({ width: 1000, height: 500 }),
          onDismiss,
        }),
      );

    it('рамка получает uri и режим cover, когда размер фото известен', async () => {
      const { result } = setup();
      await flush();
      expect(result.current.overlayUri).toBe('file:///photo.jpg');
      expect(result.current.overlayFit).toBe('cover');
    });

    it('при закрытии рамка сужается ровно до размера плитки (без выхода за её края)', async () => {
      const onDismiss = jest.fn();
      const { result, rerender } = setup(onDismiss);
      await flush();
      act(() => result.current.requestClose());
      await flush();
      rerender({});
      const frame = result.current.frameStyle as unknown as Record<string, number>;
      expect(frame.left).toBe(tile.x);
      expect(frame.top).toBe(tile.y);
      expect(frame.width).toBe(tile.width);
      expect(frame.height).toBe(tile.height);
      expect(frame.borderRadius).toBeGreaterThan(0);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('если размер фото неизвестен — рамка рисуется как contain', async () => {
      const { result } = renderHook(() =>
        useHeroDismiss({
          visible: true,
          getSourceRect: () => Promise.resolve(tile),
          getHeroImageUri: () => 'file:///photo.jpg',
          getImageSize: () => null,
          onDismiss: jest.fn(),
        }),
      );
      await flush();
      expect(result.current.overlayFit).toBe('contain');
    });
  });
});
