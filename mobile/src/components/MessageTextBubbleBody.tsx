import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

type MessageTextBubbleBodyProps = {
  text?: string;
  /** Optional rich text (e.g. search highlights); overrides `text` when set. */
  children?: React.ReactNode;
  textStyle: StyleProp<TextStyle>;
  rowStyle?: StyleProp<ViewStyle>;
  meta: React.ReactNode;
  /**
   * When true (media captions under a full-width image), text uses the parent bubble width.
   * When false (plain text), the block shrink-wraps like Telegram.
   */
  fillWidth?: boolean;
  /** Reserve a wider footer for channel view counters. */
  hasViews?: boolean;
};

/**
 * Text + time/status laid out like Telegram: the text reserves space at the end
 * of its final line and the metadata is pinned into that space. If the final line
 * is full, the reserved spaces wrap and create a stable footer line.
 */
export function MessageTextBubbleBody({
  text = '',
  children,
  textStyle,
  rowStyle,
  meta,
  fillWidth = false,
  hasViews = false,
}: MessageTextBubbleBodyProps) {
  const body = children ?? text;
  const metaSpacer = hasViews
    ? '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'
    : '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';

  return (
    <View
      style={[
        fillWidth ? styles.containerFill : styles.containerShrink,
        rowStyle,
        styles.positionedContent,
      ]}
    >
      <Text style={[textStyle, styles.messageText]}>
        {body}
        {metaSpacer}
      </Text>
      <View style={styles.metaWrap}>{meta}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  containerShrink: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  containerFill: {
    alignSelf: 'stretch',
    width: '100%',
  },
  positionedContent: {
    position: 'relative',
    flexDirection: 'column',
    minHeight: 20,
  },
  messageText: {
    flexShrink: 1,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  metaWrap: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 20,
  },
});
