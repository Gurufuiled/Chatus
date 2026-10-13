import { buildChannelPostMediaTiles } from './channelPostMediaTiles';
import { channelPostMediaTileId } from './channelPostMediaTileId';
import type { Message } from '../stores/types';

const message = (media: Array<Record<string, unknown>>, extra: Partial<Message> = {}): Message =>
  ({
    id: 'post-7',
    chat_id: 'chan-1',
    msg_type: 'image',
    content: 'Подпись',
    media,
    ...extra,
  }) as unknown as Message;

describe('buildChannelPostMediaTiles ↔ thumbId миниатюр', () => {
  it('id плиток совпадают с id, которыми экраны регистрируют миниатюры', () => {
    const tiles = buildChannelPostMediaTiles(
      message([
        { remote_url: 'https://x/a.jpg', media_type: 'image' },
        { remote_url: 'https://x/b.jpg', media_type: 'image' },
      ]),
    );
    expect(tiles.map((t) => t.id)).toEqual([
      channelPostMediaTileId('post-7', 0),
      channelPostMediaTileId('post-7', 1),
    ]);
  });

  it('медиа без remote_url пропускаются, а индекс считается уже по оставшимся (как в ленте)', () => {
    const tiles = buildChannelPostMediaTiles(
      message([
        { remote_url: 'https://x/a.jpg', media_type: 'image' },
        { remote_url: '   ', media_type: 'image' },
        { remote_url: 'https://x/c.jpg', media_type: 'image' },
      ]),
    );
    expect(tiles).toHaveLength(2);
    expect(tiles[1].id).toBe(channelPostMediaTileId('post-7', 1));
    expect(tiles[1].uri).toBe('https://x/c.jpg');
  });

  it('подпись только у первой плитки; видео получает kind=video и превью', () => {
    const tiles = buildChannelPostMediaTiles(
      message(
        [
          { remote_url: 'https://x/v.mp4', media_type: 'video', thumbnail_url: 'https://x/t.jpg', duration_ms: 5000 },
          { remote_url: 'https://x/b.jpg', media_type: 'image' },
        ],
        { msg_type: 'video' },
      ),
    );
    expect(tiles[0].kind).toBe('video');
    expect(tiles[0].previewUri).toBe('https://x/t.jpg');
    expect(tiles[0].caption).toBe('Подпись');
    expect(tiles[1].caption).toBeUndefined();
  });

  it('пост без медиа даёт пустой список', () => {
    expect(buildChannelPostMediaTiles(message([]))).toEqual([]);
  });

  it('размер медиа передаётся в плитки (для посадки фото на миниатюру без «подгонки»)', () => {
    const tiles = buildChannelPostMediaTiles(
      message([
        { remote_url: 'https://x/a.jpg', media_type: 'image', width: 1200, height: 800 },
        { remote_url: 'https://x/b.jpg', media_type: 'image' },
      ]),
    );
    expect(tiles[0]).toMatchObject({ width: 1200, height: 800 });
    expect(tiles[1].width).toBeUndefined();
    expect(tiles[1].height).toBeUndefined();
  });
});
