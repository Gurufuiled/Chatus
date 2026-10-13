/**
 * Плитка сетки медиа в профиле: фото рисуется миниатюрой (`previewUri`), а не полным файлом.
 * Запуск: npx jest src/components/MediaTilePreview.test.tsx
 */
import React from 'react';
import { Image } from 'expo-image';
import { render } from '@testing-library/react-native';
import { MediaTilePreview, type MediaTile } from './ChatProfileMediaSection';

jest.mock('@expo/vector-icons/Feather', () => 'Feather'); // иконка грузит шрифт асинхронно — для логики не нужна
jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../theme/palettes').getPaletteForScheme('light') }),
}));
// сам плеер голосовых тянет нативный expo-av — плиткам он не нужен
jest.mock('../contexts/VoicePlayerContext', () => ({
  useVoicePlaybackForUri: jest.fn(),
  useVoicePlayerControls: jest.fn(),
}));
jest.mock('./peerFirstMedia', () => ({
  usePeerFirstResolvedUri: (_lineId: string | null | undefined, uri: string | null) => uri ?? '',
}));
jest.mock('../utils/videoThumbnail', () => ({
  ensureVideoThumbnailUri: jest.fn(() => Promise.resolve('')),
  getCachedVideoThumbnailUri: jest.fn(() => ''),
}));

const imageSource = (tree: ReturnType<typeof render>) =>
  (tree.UNSAFE_getByType(Image).props.source as { uri: string }).uri;

describe('MediaTilePreview: фото в сетке', () => {
  it('берёт миниатюру, а не полный файл (регрессия: декодировалось полноразмерное фото)', () => {
    const tile: MediaTile = {
      id: '1',
      kind: 'image',
      uri: 'file:///full-2560.jpg',
      previewUri: 'file:///thumb-320.jpg',
    };
    expect(imageSource(render(<MediaTilePreview item={tile} />))).toBe('file:///thumb-320.jpg');
  });

  it('миниатюры нет — рисует сам файл, как раньше', () => {
    const tile: MediaTile = { id: '2', kind: 'image', uri: 'file:///full.jpg' };
    expect(imageSource(render(<MediaTilePreview item={tile} />))).toBe('file:///full.jpg');
  });

  it('пустая миниатюра (пробелы) считается отсутствующей', () => {
    const tile: MediaTile = { id: '3', kind: 'image', uri: 'file:///full.jpg', previewUri: '   ' };
    expect(imageSource(render(<MediaTilePreview item={tile} />))).toBe('file:///full.jpg');
  });

  it('видео с превью рисует превью', () => {
    const tile: MediaTile = { id: '4', kind: 'video', uri: '', previewUri: 'file:///vt.jpg' };
    expect(imageSource(render(<MediaTilePreview item={tile} />))).toBe('file:///vt.jpg');
  });

  it('когда показывать нечего — заглушка без картинки', () => {
    const tile: MediaTile = { id: '5', kind: 'video', uri: '' };
    expect(render(<MediaTilePreview item={tile} />).UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });
});
