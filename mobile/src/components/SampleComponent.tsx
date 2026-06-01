import React from 'react';
import { Text, View } from 'react-native';

export const SampleComponent = ({ title }: { title: string }) => {
  return (
    <View>
      <Text testID="sample-title">{title}</Text>
    </View>
  );
};
