import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../theme/palettes';

const THUMB_SIZE = 22;
const THUMB_GAP = 4;

type TelegramDialogListPreviewProps = {
  text: string;
  thumbnailUris?: string[];
  accentLabel?: boolean;
  colors: ThemeColors;
  placeholder?: string;
};

export function TelegramDialogListPreview({
  text,
  thumbnailUris = [],
  accentLabel = false,
  colors,
  placeholder = '',
}: TelegramDialogListPreviewProps) {
  const trimmed = text.trim() || placeholder.trim();
  const thumbs = thumbnailUris.filter(Boolean).slice(0, 3);

  if (!trimmed && thumbs.length === 0) {
    return null;
  }

  return (
    <View style={styles.row}>
      {thumbs.length > 0 ? (
        <View style={styles.thumbs}>
          {thumbs.map((uri, index) => (
            <Image key={`${uri}-${index}`} source={{ uri }} style={styles.thumb} />
          ))}
        </View>
      ) : null}
      {trimmed ? (
        <Text
          style={[styles.text, { color: accentLabel ? colors.accent : colors.textSecondary }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {trimmed}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 6,
  },
  thumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THUMB_GAP,
    flexShrink: 0,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.25)',
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
  },
});
