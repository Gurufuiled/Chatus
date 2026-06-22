import React from 'react';
import { Platform, View } from 'react-native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

/** Opaque full-width stack header for iOS `transparentModal` chat screens (avoids side bleed). */
export function createIosOpaqueChatHeaderOptions(
  toolbarColor: string,
): Partial<NativeStackNavigationOptions> {
  if (Platform.OS !== 'ios') {
    return {};
  }
  return {
    headerStyle: { backgroundColor: toolbarColor },
    headerBackground: () => (
      <View style={{ flex: 1, backgroundColor: toolbarColor }} />
    ),
  };
}
