import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { MediaThumbPressable } from './MediaThumbPressable';
import { registerMediaThumb, unregisterMediaThumb } from '../utils/mediaThumbRegistry';

jest.mock('../utils/mediaThumbRegistry', () => ({
  registerMediaThumb: jest.fn(),
  unregisterMediaThumb: jest.fn(),
}));

const register = registerMediaThumb as jest.Mock;
const unregister = unregisterMediaThumb as jest.Mock;

describe('MediaThumbPressable', () => {
  beforeEach(() => {
    register.mockClear();
    unregister.mockClear();
  });

  it('регистрирует свой View под thumbId при монтировании', () => {
    const { unmount } = render(<MediaThumbPressable thumbId="photo-1" />);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0][0]).toBe('photo-1');
    expect(register.mock.calls[0][1]).toBeTruthy();
    unmount();
  });

  it('снимает регистрацию того же узла при размонтировании', () => {
    const { unmount } = render(<MediaThumbPressable thumbId="photo-2" />);
    const node = register.mock.calls[0][1];
    unmount();
    expect(unregister).toHaveBeenCalledWith('photo-2', node);
  });

  it('при смене thumbId снимает старый id и регистрирует новый', () => {
    const { rerender, unmount } = render(<MediaThumbPressable thumbId="a" />);
    rerender(<MediaThumbPressable thumbId="b" />);
    expect(unregister).toHaveBeenCalledWith('a', expect.anything());
    expect(register).toHaveBeenLastCalledWith('b', expect.anything());
    unmount();
  });

  it('пробрасывает onPress в Pressable', () => {
    const onPress = jest.fn();
    const { getByTestId, unmount } = render(
      <MediaThumbPressable thumbId="c" testID="tile" onPress={onPress} />,
    );
    fireEvent.press(getByTestId('tile'));
    expect(onPress).toHaveBeenCalledTimes(1);
    unmount();
  });
});
