/**
 * Реакции у фото/видео: без подписи — отдельная «таблетка» под пузырём (как в Telegram), с подписью — внутри.
 * Запуск: npx jest src/components/MediaBubbleReactions.test.tsx
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { ImageBubble } from './ImageBubble';
import { VideoBubble } from './VideoBubble';

const BUBBLE_COLOR = '#123456';

const mockReactionProps: Array<Record<string, unknown>> = [];
jest.mock('./MessageReactionInline', () => ({
  MessageReactionInline: (props: Record<string, unknown>) => {
    const { View } = require('react-native');
    mockReactionProps.push(props);
    return <View testID="reactions-mock" />;
  },
}));
jest.mock('./MessageTimeStatus', () => ({ MessageTimeStatus: () => null }));
jest.mock('./MessageTextBubbleBody', () => ({ MessageTextBubbleBody: () => null }));
jest.mock('./SingleImageViewerModal', () => ({ SingleImageViewerModal: () => null }));
jest.mock('./HeroOverlay', () => ({ HeroOverlay: () => null }));
jest.mock('../hooks/useHeroDismiss', () => ({ useHeroDismiss: jest.fn() }));
jest.mock('../utils/mediaThumbRegistry', () => ({
  registerMediaThumb: jest.fn(),
  unregisterMediaThumb: jest.fn(),
  measureThumbRef: jest.fn(),
}));
jest.mock('../utils/videoThumbnail', () => ({
  ensureVideoThumbnailUri: jest.fn(() => new Promise<string>(() => undefined)),
  getCachedVideoThumbnailUri: jest.fn(() => ''),
}));
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), addListener: jest.fn() }),
  VideoView: () => null,
}));
jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  useEvent: (_p: unknown, _e: string, init: unknown) => init,
}));
jest.mock('expo-image', () => {
  const React = require('react');
  return { Image: (props: object) => React.createElement('MockExpoImage', props) };
});
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons/Feather', () => 'Feather');

type Node = { parent: Node | null; props: { style?: unknown } };

/** Лежит ли узел внутри цветной рамки пузыря (элемент с фоном `BUBBLE_COLOR`). */
const insideColoredBubble = (node: Node): boolean => {
  for (let current: Node | null = node.parent; current; current = current.parent) {
    const style = StyleSheet.flatten(current.props?.style as never) as { backgroundColor?: string } | undefined;
    if (style?.backgroundColor === BUBBLE_COLOR) return true;
  }
  return false;
};

const reactions = [{ emoji: '❤️', count: 1, reacted_by_me: false }];

const cases: Array<[string, (extra: Record<string, unknown>) => React.ReactElement]> = [
  [
    'фото',
    (extra) => (
      <ImageBubble uri="file:///p.jpg" isMe width={800} height={600} bubbleMeColor={BUBBLE_COLOR} time="12:11" {...extra} />
    ),
  ],
  [
    'видео',
    (extra) => (
      <VideoBubble uri="file:///v.mp4" isMe width={800} height={600} bubbleMeColor={BUBBLE_COLOR} time="12:11" {...extra} />
    ),
  ],
];

beforeEach(() => {
  mockReactionProps.length = 0;
});

describe.each(cases)('%s: реакции', (_name, make) => {
  it('без подписи реакция вынесена из цветной рамки пузыря (раньше под медиа дорисовывалась цветная полоса)', () => {
    const { getByTestId } = render(make({ inlineReactions: reactions }));
    expect(insideColoredBubble(getByTestId('reactions-mock') as never)).toBe(false);
  });

  it('вынесенная реакция — компактная таблетка, прижатая к краю своего пузыря', () => {
    const mine = render(make({ inlineReactions: reactions, isMe: true }));
    expect(mine.getAllByTestId('reactions-mock')).toHaveLength(1); // ровно одна таблетка в дереве
    expect(mockReactionProps.length).toBeGreaterThan(0);
    expect(mockReactionProps.every((p) => p.variant === 'floatingTail' && p.tailAlign === 'end')).toBe(true);
    mine.unmount();

    mockReactionProps.length = 0;
    render(make({ inlineReactions: reactions, isMe: false }));
    expect(mockReactionProps.every((p) => p.tailAlign === 'start')).toBe(true);
  });

  it('с подписью реакции остаются внутри пузыря, как раньше', () => {
    const { getByTestId } = render(make({ inlineReactions: reactions, caption: 'Подпись' }));
    expect(insideColoredBubble(getByTestId('reactions-mock') as never)).toBe(true);
    expect(mockReactionProps[0].variant).toBeUndefined();
  });

  it('во вложенном виде (ответ на сообщение) реакции тоже не выносятся', () => {
    const { getByTestId } = render(make({ inlineReactions: reactions, embedded: true }));
    expect(getByTestId('reactions-mock')).toBeTruthy();
    expect(mockReactionProps[0].variant).toBeUndefined();
  });

  it('без реакций ничего лишнего не рисуется', () => {
    const { queryByTestId } = render(make({}));
    expect(queryByTestId('reactions-mock')).toBeNull();
  });

  it('реакция передаёт нажатие наверх', () => {
    const onToggle = jest.fn();
    render(make({ inlineReactions: reactions, allowMessageReactions: true, onToggleInlineReaction: onToggle }));
    expect(mockReactionProps[0].allowReactions).toBe(true);
    (mockReactionProps[0].onToggle as (emoji: string) => void)('❤️');
    expect(onToggle).toHaveBeenCalledWith('❤️');
  });
});

describe('размеры медиа в пузыре', () => {
  const mediaBox = (utils: ReturnType<typeof render>, label: string) => {
    const node = utils.getByLabelText(label);
    return StyleSheet.flatten(node.props.style as never) as { width: number; height: number };
  };

  it('вытянутое видео (9:16) не уже, чем у Telegram: ширина почти до предела, а не ужата под высоту', () => {
    const utils = render(<VideoBubble uri="file:///v.mp4" isMe width={576} height={1024} />);
    const box = mediaBox(utils, 'Open video');
    // раньше ширина получалась ~202 (576 × 360/1024) и подпись со временем не помещалась в строку
    expect(box.width).toBeGreaterThan(202);
    expect(box.height).toBeLessThanOrEqual(360);
  });

  it('вытянутое фото получает ту же ширину', () => {
    const utils = render(<ImageBubble uri="file:///p.jpg" isMe width={576} height={1024} />);
    expect(mediaBox(utils, 'View image fullscreen').width).toBeGreaterThan(202);
  });

  it('горизонтальное видео остаётся по ширине предела', () => {
    const utils = render(<VideoBubble uri="file:///v.mp4" isMe width={1280} height={720} />);
    const box = mediaBox(utils, 'Open video');
    expect(box.width / box.height).toBeCloseTo(16 / 9, 1);
  });
});
