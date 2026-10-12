import React from 'react';
import { render } from '@testing-library/react-native';
import { HeroOverlay } from './HeroOverlay';

// нативный Reanimated и expo-image в jest недоступны — подменяем простыми компонентами
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
}));
jest.mock('expo-image', () => {
  const React = require('react');
  return { Image: (props: object) => React.createElement('MockExpoImage', props) };
});

const frameStyle = { opacity: 1, left: 10, top: 20, width: 100, height: 100, borderRadius: 8 };

describe('HeroOverlay', () => {
  it('ничего не рисует, пока нет uri фото', () => {
    const { toJSON } = render(
      <HeroOverlay hero={{ frameStyle, overlayUri: null, overlayFit: 'cover' } as never} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('рисует фото в рамке с нужным режимом вписывания', () => {
    const { UNSAFE_getByProps } = render(
      <HeroOverlay hero={{ frameStyle, overlayUri: 'file:///p.jpg', overlayFit: 'cover' } as never} />,
    );
    const image = UNSAFE_getByProps({ contentFit: 'cover' });
    expect(image.props.source).toEqual({ uri: 'file:///p.jpg' });
  });

  it('если размер фото неизвестен — contain (без обрезки)', () => {
    const { UNSAFE_getByProps } = render(
      <HeroOverlay hero={{ frameStyle, overlayUri: 'file:///p.jpg', overlayFit: 'contain' } as never} />,
    );
    expect(UNSAFE_getByProps({ contentFit: 'contain' })).toBeTruthy();
  });
});
