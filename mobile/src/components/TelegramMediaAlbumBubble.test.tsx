import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { TelegramMediaAlbumBubble } from './TelegramMediaAlbumBubble';
import { registerMediaThumb } from '../utils/mediaThumbRegistry';
import { buildTelegramAlbumViewerTiles } from '../screens/telegramChat/telegramAlbumMediaTiles';
import type { TelegramAlbumMediaItem } from '../screens/telegramChat/types';

jest.mock('../utils/mediaThumbRegistry', () => ({
  registerMediaThumb: jest.fn(),
  unregisterMediaThumb: jest.fn(),
}));
jest.mock('./MessageTimeStatus', () => ({ MessageTimeStatus: () => null }));
jest.mock('./MessageTextBubbleBody', () => ({ MessageTextBubbleBody: () => null }));
jest.mock('./OutgoingBubbleViewportGradient', () => ({ MeBubbleChrome: () => null }));

const register = registerMediaThumb as jest.Mock;

// стили и тема не важны для проверки — отдаём пустые объекты на любое обращение
const anyObject = () => new Proxy({}, { get: () => ({}) }) as never;

const image = (messageId: number, mediaUri?: string): TelegramAlbumMediaItem => ({
  messageId,
  kind: 'image',
  mediaUri,
  width: 800,
  height: 600,
});

const renderAlbum = (items: TelegramAlbumMediaItem[], onTilePress?: (id: number) => void) =>
  render(
    <TelegramMediaAlbumBubble
      items={items}
      isMe={false}
      time="12:00"
      status="sent"
      styles={anyObject()}
      chatTheme={anyObject()}
      viewportOutgoingGradient={false}
      scrollTick={0}
      onTilePress={onTilePress}
    />,
  );

describe('TelegramMediaAlbumBubble: миниатюры для возврата фото на место', () => {
  beforeEach(() => register.mockClear());

  it('регистрирует каждую открываемую плитку под id `tg-<messageId>`', () => {
    renderAlbum([image(11, 'file:///a.jpg'), image(12, 'file:///b.jpg')], jest.fn());
    const ids = register.mock.calls.map((c) => c[0]);
    expect(ids).toEqual(expect.arrayContaining(['tg-11', 'tg-12']));
  });

  it('id плиток совпадают с id во вьювере (иначе фото не найдёт, куда садиться)', () => {
    const items = [image(21, 'file:///a.jpg'), image(22, 'file:///b.jpg')];
    renderAlbum(items, jest.fn());
    const viewerIds = buildTelegramAlbumViewerTiles(items).map((t) => t.id);
    const registered = register.mock.calls.map((c) => c[0]);
    for (const id of viewerIds) expect(registered).toContain(id);
  });

  it('не регистрирует плитки, которые нельзя открыть (нет onTilePress)', () => {
    renderAlbum([image(31, 'file:///a.jpg')], undefined);
    expect(register).not.toHaveBeenCalled();
  });

  it('нажатие на плитку вызывает onTilePress с messageId', () => {
    const onTilePress = jest.fn();
    const { getAllByLabelText } = renderAlbum([image(41, 'file:///a.jpg')], onTilePress);
    fireEvent.press(getAllByLabelText('Открыть медиа')[0]);
    expect(onTilePress).toHaveBeenCalledWith(41);
  });
});
