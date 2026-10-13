import React from 'react';
import { ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ImageBubble } from './ImageBubble';
import { registerMediaThumb, unregisterMediaThumb } from '../utils/mediaThumbRegistry';

jest.mock('../utils/mediaThumbRegistry', () => ({
  registerMediaThumb: jest.fn(),
  unregisterMediaThumb: jest.fn(),
  measureThumbRef: jest.fn(),
}));

const mockViewer = jest.fn((_props: Record<string, unknown>) => null);
jest.mock('./SingleImageViewerModal', () => ({
  SingleImageViewerModal: (props: Record<string, unknown>) => mockViewer(props),
}));
jest.mock('./MessageTimeStatus', () => ({ MessageTimeStatus: () => null }));
jest.mock('./MessageReactionInline', () => ({ MessageReactionInline: () => null }));
jest.mock('./MessageTextBubbleBody', () => ({ MessageTextBubbleBody: () => null }));

const lastViewerProps = () => mockViewer.mock.calls[mockViewer.mock.calls.length - 1][0];

describe('ImageBubble: полноэкранный просмотр', () => {
  beforeEach(() => mockViewer.mockClear());

  it('по умолчанию вьювер скрыт и получает uri и ссылку на фото-источник', () => {
    render(<ImageBubble uri="file:///photo.jpg" isMe={false} width={800} height={600} />);
    const props = lastViewerProps();
    expect(props.visible).toBe(false);
    expect(props.uri).toBe('file:///photo.jpg');
    expect(props.sourceRef).toBeTruthy();
    expect(props.imageSize).toEqual({ width: 800, height: 600 });
  });

  it('тап по фото открывает вьювер, onClose закрывает', () => {
    const { getByLabelText } = render(
      <ImageBubble uri="file:///photo.jpg" isMe={false} width={800} height={600} />,
    );
    fireEvent.press(getByLabelText('View image fullscreen'));
    expect(lastViewerProps().visible).toBe(true);

    act(() => {
      (lastViewerProps().onClose as () => void)();
    });
    expect(lastViewerProps().visible).toBe(false);
  });

  it('если родитель сам обрабатывает fullscreen — свой вьювер не создаётся', () => {
    const onOpenFullscreen = jest.fn();
    const { getByLabelText } = render(
      <ImageBubble
        uri="file:///photo.jpg"
        isMe={false}
        width={800}
        height={600}
        onOpenFullscreen={onOpenFullscreen}
      />,
    );
    fireEvent.press(getByLabelText('View image fullscreen'));
    expect(onOpenFullscreen).toHaveBeenCalledTimes(1);
    expect(mockViewer).not.toHaveBeenCalled();
  });

  it('размер неизвестен — imageSize = null (вьювер впишет фото по экрану)', () => {
    render(<ImageBubble uri="file:///photo.jpg" isMe={false} />);
    expect(lastViewerProps().imageSize).toBeNull();
  });

  it('thumbId: регистрирует фото в сообщении для посадки при закрытии и снимает при размонтировании', () => {
    (registerMediaThumb as jest.Mock).mockClear();
    (unregisterMediaThumb as jest.Mock).mockClear();
    const { unmount } = render(
      <ImageBubble uri="file:///photo.jpg" isMe={false} thumbId="chat-media:file:///photo.jpg" />,
    );
    expect(registerMediaThumb).toHaveBeenCalledWith('chat-media:file:///photo.jpg', expect.anything());
    unmount();
    expect(unregisterMediaThumb).toHaveBeenCalledWith('chat-media:file:///photo.jpg', expect.anything());
  });

  it('без thumbId ничего не регистрируется', () => {
    (registerMediaThumb as jest.Mock).mockClear();
    render(<ImageBubble uri="file:///photo.jpg" isMe={false} />);
    expect(registerMediaThumb).not.toHaveBeenCalled();
  });

});

describe('ImageBubble: мини-превью → полное фото (регрессия: пропадало и мелькал спиннер)', () => {
  const MINI = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';

  it('когда data:-превью меняется на файл, оно остаётся плейсхолдером и спиннера нет', () => {
    const { rerender, UNSAFE_getAllByType, UNSAFE_queryAllByType } = render(
      <ImageBubble uri={MINI} isMe={false} width={800} height={600} />,
    );
    rerender(<ImageBubble uri="file:///full.jpg" isMe={false} width={800} height={600} />);

    const image = UNSAFE_getAllByType(Image)[0];
    expect(image.props.source).toEqual({ uri: 'file:///full.jpg' });
    expect(image.props.placeholder).toEqual({ uri: MINI });
    expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
  });

  it('без предшествующего превью (сразу файл) плейсхолдера нет, а спиннер показывается до загрузки', () => {
    const { UNSAFE_getAllByType, UNSAFE_queryAllByType } = render(
      <ImageBubble uri="file:///full.jpg" isMe={false} width={800} height={600} />,
    );
    expect(UNSAFE_getAllByType(Image)[0].props.placeholder).toBeUndefined();
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  });

  it('само превью (data:) показывается без плейсхолдера и без спиннера', () => {
    const { UNSAFE_getAllByType, UNSAFE_queryAllByType } = render(
      <ImageBubble uri={MINI} isMe={false} width={800} height={600} />,
    );
    expect(UNSAFE_getAllByType(Image)[0].props.placeholder).toBeUndefined();
    expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
  });

  it('пустой адрес сбрасывает запомненное превью: следующий файл — без чужого плейсхолдера', () => {
    const { rerender, UNSAFE_getAllByType } = render(
      <ImageBubble uri={MINI} isMe={false} width={800} height={600} />,
    );
    rerender(<ImageBubble uri="" isMe={false} width={800} height={600} />);
    rerender(<ImageBubble uri="file:///other.jpg" isMe={false} width={800} height={600} />);
    expect(UNSAFE_getAllByType(Image)[0].props.placeholder).toBeUndefined();
  });
});
