import * as React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path, Circle } from 'react-native-svg';
import type { MessageSource } from '../stores/types';

interface PlatformSourceIconProps {
  source?: MessageSource;
  size?: number;
  style?: ViewStyle;
}

export function PlatformSourceIcon({ source, size = 12, style }: PlatformSourceIconProps) {
  if (!source) return null;

  if (source === 'chatus') {
    return (
      <View style={[styles.container, style]}>
        <Image
          source={require('../../assets/chatus_icon.png')}
          style={{ width: size, height: size }}
          contentFit="contain"
        />
      </View>
    );
  }

  if (source === 'telegram') {
    return (
      <View style={[styles.container, style]}>
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="12" fill="#34A5E4" />
          <Path
            d="M5.44 11.45l11.75-4.52c.54-.2 1.02.13.84.9l-2 9.4c-.15.68-.56.85-1.12.54l-3.1-2.28-1.5 1.45c-.16.16-.3.3-.61.3l.22-3.15 5.73-5.18c.25-.22-.05-.34-.38-.12l-7.08 4.46-3.05-.95c-.66-.2-.68-.66.14-.98z"
            fill="#FFFFFF"
          />
        </Svg>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    marginRight: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
