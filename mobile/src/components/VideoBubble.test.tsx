import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { VideoBubble } from './VideoBubble';
import { registerMediaThumb, unregisterMediaThumb } from '../utils/mediaThumbRegistry';

jest.mock('../utils/mediaThumbRegistry', () => ({
  registerMediaThumb: jest.fn(),
  unregisterMediaThumb: jest.fn(),
  measureThumbRef: jest.fn(),
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
jest.mock('../hooks/useHeroDismiss', () => ({ useHeroDismiss: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../utils/videoThumbnail', () => ({
  ensureVideoThumbnailUri: jest.fn(() => new Promise<string>(() => undefined)),
  getCachedVideoThumbnailUri: jest.fn(() => ''),
}));
jest.mock('./HeroOverlay', () => ({ HeroOverlay: () => null }));
jest.mock('./MessageTimeStatus', () => ({ MessageTimeStatus: () => null }));
jest.mock('./MessageReactionInline', () => ({ MessageReactionInline: () => null }));
jest.mock('./MessageTextBubbleBody', () => ({ MessageTextBubbleBody: () => null }));

describe('VideoBubble: превью для возврата кадра на место', () => {
  beforeEach(() => {
    (registerMediaThumb as jest.Mock).mockClear();
    (unregisterMediaThumb as jest.Mock).mockClear();
  });

  it('thumbId: регистрирует превью видео и снимает при размонтировании', () => {
    const { unmount } = render(
      <VideoBubble uri="file:///v.mp4" isMe={false} thumbId="chat-media:file:///v.mp4" />,
    );
    expect(registerMediaThumb).toHaveBeenCalledWith('chat-media:file:///v.mp4', expect.anything());
    unmount();
    expect(unregisterMediaThumb).toHaveBeenCalledWith('chat-media:file:///v.mp4', expect.anything());
  });

  it('без thumbId ничего не регистрируется', () => {
    render(<VideoBubble uri="file:///v.mp4" isMe={false} />);
    expect(registerMediaThumb).not.toHaveBeenCalled();
  });

  it('если родитель сам открывает fullscreen — вызывает onOpenFullscreen', () => {
    const onOpenFullscreen = jest.fn();
    const { getByLabelText } = render(
      <VideoBubble uri="file:///v.mp4" isMe={false} onOpenFullscreen={onOpenFullscreen} />,
    );
    fireEvent.press(getByLabelText('Open video'));
    expect(onOpenFullscreen).toHaveBeenCalledTimes(1);
  });
});
