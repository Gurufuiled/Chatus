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
  /** @deprecated kept for call-site compatibility. */
  hasViews?: boolean;
};

/**
 * Text + time/status laid out like Telegram: a flex-wrap row where the meta sits at the end
 * of the last line when it fits, otherwise wraps to a new line pinned to the right
 * (`marginLeft: 'auto'`). Short messages keep the meta inline; long ones never overlap.
 */
export function MessageTextBubbleBody({
  text = '',
  children,
  textStyle,
  rowStyle,
  meta,
  fillWidth = false,
}: MessageTextBubbleBodyProps) {
  const body = children ?? text;

  return (
    <View style={[fillWidth ? styles.containerFill : styles.containerShrink, rowStyle]}>
      <View style={styles.textMetaRow}>
        <Text style={[textStyle, styles.messageText]}>{body}</Text>
        <View style={styles.metaWrap}>{meta}</View>
      </View>
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
  textMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  messageText: {
    flexShrink: 1,
  },
  metaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginLeft: 'auto',
    paddingLeft: 8,
    flexShrink: 0,
  },
});
