/**
 * Плашка нескачанного видео в Telegram-чате: кнопка «скачать» с размером, индикатор загрузки, нажатия.
 * Запуск: npx jest src/components/TelegramPendingMediaBubble.test.tsx
 */
import React from 'react';
import { ActivityIndicator } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { PendingVideoBubble } from './TelegramPendingMediaBubble';

jest.mock('./MessageTimeStatus', () => ({ MessageTimeStatus: () => null }));
jest.mock('@expo/vector-icons/Feather', () => 'Feather'); // иконка грузит шрифт асинхронно — для логики не нужна
jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../theme/palettes').getPaletteForScheme('light') }),
}));

describe('PendingVideoBubble: кнопка «скачать»', () => {
  it('показывает размер файла на кнопке', () => {
    const { getByTestId } = render(<PendingVideoBubble isMe={false} sizeLabel="48.0 МБ" />);
    expect(getByTestId('telegram-pending-video-size').props.children).toBe('48.0 МБ');
  });

  it('без размера (неизвестен) подписи нет, но кнопка есть', () => {
    const { queryByTestId, getByLabelText } = render(<PendingVideoBubble isMe={false} />);
    expect(queryByTestId('telegram-pending-video-size')).toBeNull();
    expect(getByLabelText('Скачать видео')).toBeTruthy();
  });

  it('во время загрузки вместо размера индикатор, а подпись кнопки — «Отменить»', () => {
    const { queryByTestId, UNSAFE_queryAllByType, getByLabelText } = render(
      <PendingVideoBubble isMe={false} sizeLabel="48.0 МБ" isDownloading />,
    );
    expect(queryByTestId('telegram-pending-video-size')).toBeNull();
    expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(1);
    expect(getByLabelText('Отменить загрузку видео')).toBeTruthy();
  });

  it('нажатие на плашку вызывает onPress', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<PendingVideoBubble isMe={false} onPress={onPress} />);
    fireEvent.press(getByTestId('telegram-pending-video'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('долгое нажатие уходит наружу (меню сообщения), а не превращается в загрузку', () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const { getByTestId } = render(
      <PendingVideoBubble isMe={false} onPress={onPress} onLongPress={onLongPress} />,
    );
    fireEvent(getByTestId('telegram-pending-video'), 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('без обработчиков не падает на нажатии', () => {
    const { getByTestId } = render(<PendingVideoBubble isMe={false} />);
    expect(() => fireEvent.press(getByTestId('telegram-pending-video'))).not.toThrow();
  });
});
