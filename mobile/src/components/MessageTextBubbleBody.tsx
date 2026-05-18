import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

type MessageTextBubbleBodyProps = {
  text: string;
  textStyle: StyleProp<TextStyle>;
  rowStyle?: StyleProp<ViewStyle>;
  viewCountNode?: React.ReactNode;
  meta: React.ReactNode;
};

/** Текст + время/статус в одной строке (как в Chatus): время у нижнего края, без absolute overlay. */
export function MessageTextBubbleBody({
  text,
  textStyle,
  rowStyle,
  viewCountNode,
  meta,
}: MessageTextBubbleBodyProps) {
  return (
    <View style={[styles.row, rowStyle]}>
      <Text style={[textStyle, styles.text]}>
        {text || ' '}
        {viewCountNode}
      </Text>
      <View style={styles.metaSlot}>{meta}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  text: {
    flexShrink: 1,
  },
  metaSlot: {
    flexShrink: 0,
  },
});
