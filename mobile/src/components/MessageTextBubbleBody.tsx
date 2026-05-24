import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

type MessageTextBubbleBodyProps = {
  text: string;
  textStyle: StyleProp<TextStyle>;
  rowStyle?: StyleProp<ViewStyle>;
  meta: React.ReactNode;
  /** Pass true if the meta contains a view count, so we pad with more spaces. */
  hasViews?: boolean;
};

/** Текст + время/статус (как в Telegram): время position absolute, а в текст добавляются пробелы. */
export function MessageTextBubbleBody({
  text,
  textStyle,
  rowStyle,
  meta,
  hasViews = false,
}: MessageTextBubbleBodyProps) {
  // \u00A0 is a non-breaking space
  const spacer = hasViews 
    ? '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0' 
    : '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';

  return (
    <View style={[styles.container, rowStyle]}>
      <Text style={textStyle}>
        {text || ''}{spacer}
      </Text>
      <View style={styles.metaAbsolute}>{meta}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignSelf: 'stretch', // take full width up to maxWidth
  },
  metaAbsolute: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
});
