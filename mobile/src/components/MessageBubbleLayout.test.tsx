/**
 * Раскладка текста с временем и таблеток реакций: время у правого края пузыря, таблетка — к нужному краю.
 * Запуск: npx jest src/components/MessageBubbleLayout.test.tsx
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { MessageTextBubbleBody } from './MessageTextBubbleBody';
import { MessageReactionInline } from './MessageReactionInline';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chain: Record<string, unknown> = {};
  const self: unknown = new Proxy(chain, { get: () => () => self });
  return {
    __esModule: true,
    default: { View },
    FadeInDown: self,
    LinearTransition: self,
  };
});
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('../config', () => ({ resolveAvatarUrl: (uri: string | null) => uri }));

type Host = { parent: Host | null; props: { style?: unknown; testID?: string }; children: unknown[] };
const flat = (node: { props: { style?: unknown } }) => (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;

describe('MessageTextBubbleBody: время у правого края пузыря', () => {
  it('блок текста растягивается на ширину пузыря (регрессия: время липло к тексту, когда пузырь шире — цитата ответа)', () => {
    const { getByText } = render(
      <MessageTextBubbleBody text="Ебаааать" textStyle={{}} meta={<Text>20:59</Text>} />,
    );
    // текст → его контейнер (positionedContent)
    let container: Host | null = getByText('Ебаааать') as unknown as Host;
    while (container && flat(container).position !== 'relative') container = container.parent;
    expect(container).not.toBeNull();
    expect(flat(container!).alignSelf).toBe('stretch');
  });

  it('регрессия: текст остаётся слева, даже если экран передал rowStyle с alignItems: flex-end (в группах текст «уезжал» вправо)', () => {
    const rowStyleFromScreens = { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 6 };
    const { getByText } = render(
      <MessageTextBubbleBody text="ты" textStyle={{}} rowStyle={rowStyleFromScreens} meta={<Text>19:01</Text>} />,
    );
    let container: Host | null = getByText('ты') as unknown as Host;
    while (container && flat(container).position !== 'relative') container = container.parent;
    const style = flat(container!);
    expect(style.flexDirection).toBe('column');
    expect(style.alignItems).toBe('flex-start');
  });

  it('время прижато к правому нижнему углу блока', () => {
    const { getByText } = render(
      <MessageTextBubbleBody text="Привет" textStyle={{}} meta={<Text>10:00</Text>} />,
    );
    let wrap: Host | null = getByText('10:00') as unknown as Host;
    while (wrap && flat(wrap).position !== 'absolute') wrap = wrap.parent;
    expect(wrap).not.toBeNull();
    expect(flat(wrap!)).toMatchObject({ position: 'absolute', right: 0, bottom: 0 });
  });

  it('для подписи под фото (fillWidth) раскладка прежняя', () => {
    const { getByText } = render(
      <MessageTextBubbleBody fillWidth text="Подпись" textStyle={{}} meta={<Text>10:00</Text>} />,
    );
    let container: Host | null = getByText('Подпись') as unknown as Host;
    while (container && flat(container).position !== 'relative') container = container.parent;
    expect(flat(container!)).toMatchObject({ alignSelf: 'stretch', width: '100%' });
  });

  it('под время зарезервировано место в конце последней строки', () => {
    const { getByText } = render(
      <MessageTextBubbleBody text="Текст" textStyle={{}} meta={<Text>10:00</Text>} />,
    );
    expect(Number(flat(getByText('Текст') as never).paddingRight)).toBeGreaterThanOrEqual(48);
  });
});

describe('MessageReactionInline: плавающая таблетка', () => {
  const reactions = [{ emoji: '❤️', count: 1, reacted_by_me: false }];
  const rowOf = (utils: ReturnType<typeof render>) => {
    let node: Host | null = utils.getByLabelText('Реакция ❤️') as unknown as Host;
    while (node && flat(node).flexWrap !== 'wrap') node = node.parent;
    return flat(node!);
  };

  it('по умолчанию прижата вправо (как раньше)', () => {
    const row = rowOf(
      render(<MessageReactionInline reactions={reactions} isMe allowReactions onToggle={jest.fn()} variant="floatingTail" />),
    );
    expect(row).toMatchObject({ alignSelf: 'flex-end', justifyContent: 'flex-end' });
  });

  it('tailAlign="start" прижимает влево (реакции слева, как в Telegram)', () => {
    const row = rowOf(
      render(
        <MessageReactionInline
          reactions={reactions}
          isMe={false}
          allowReactions
          onToggle={jest.fn()}
          variant="floatingTail"
          tailAlign="start"
        />,
      ),
    );
    expect(row).toMatchObject({ alignSelf: 'flex-start', justifyContent: 'flex-start' });
  });

  it('обычный вариант (внутри текстового пузыря) от tailAlign не зависит', () => {
    const row = rowOf(
      render(<MessageReactionInline reactions={reactions} isMe allowReactions onToggle={jest.fn()} tailAlign="start" />),
    );
    expect(row.alignSelf).toBeUndefined();
  });

  it('нажатие на реакцию вызывает onToggle с эмодзи; без права — не вызывает', () => {
    const onToggle = jest.fn();
    const allowed = render(
      <MessageReactionInline reactions={reactions} isMe allowReactions onToggle={onToggle} variant="floatingTail" />,
    );
    const { fireEvent } = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
    fireEvent.press(allowed.getByLabelText('Реакция ❤️'));
    expect(onToggle).toHaveBeenCalledWith('❤️');
    allowed.unmount();

    onToggle.mockClear();
    const denied = render(
      <MessageReactionInline reactions={reactions} isMe allowReactions={false} onToggle={onToggle} variant="floatingTail" />,
    );
    fireEvent.press(denied.getByLabelText('Реакция ❤️'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('без реакций ничего не рисуется', () => {
    const { toJSON } = render(
      <MessageReactionInline reactions={[]} isMe allowReactions onToggle={jest.fn()} />,
    );
    expect(toJSON()).toBeNull();
  });
});
