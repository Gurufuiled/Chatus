import React from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TelegramWebPagePreview } from '../screens/telegramChat/types';
import { usePeerFirstResolvedUri } from './peerFirstMedia';

type WebPagePreviewBubbleProps = {
  preview: TelegramWebPagePreview;
  accentColor?: string;
  textColor?: string;
  secondaryTextColor?: string;
  /** LineSync line id (chat id) for peer-first thumbnail fetch. */
  peerFirstLineId?: string | null;
};

export function WebPagePreviewBubble({
  preview,
  accentColor = '#F28C28',
  textColor = '#FFFFFF',
  secondaryTextColor = 'rgba(255,255,255,0.7)',
  peerFirstLineId,
}: WebPagePreviewBubbleProps) {
  const resolvedPhotoUri = usePeerFirstResolvedUri(peerFirstLineId, preview.photoUri);
  const hasPhoto = !!resolvedPhotoUri?.trim();

  const handlePress = React.useCallback(() => {
    if (preview.url) {
      void Linking.openURL(preview.url).catch(() => undefined);
    }
  }, [preview.url]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Открыть ссылку ${preview.siteName || preview.title || preview.url}`}
      onPress={handlePress}
      style={({ pressed }) => [styles.root, pressed && styles.rootPressed]}
    >
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <View style={styles.content}>
        {preview.siteName ? (
          <Text style={[styles.siteName, { color: accentColor }]} numberOfLines={1}>
            {preview.siteName}
          </Text>
        ) : null}
        
        {preview.title ? (
          <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
            {preview.title}
          </Text>
        ) : null}
        
        {preview.description ? (
          <Text style={[styles.description, { color: textColor }]} numberOfLines={3}>
            {preview.description}
          </Text>
        ) : null}

        {hasPhoto ? (
          <Image
            source={{ uri: resolvedPhotoUri }}
            style={styles.photo}
            resizeMode="cover"
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    marginTop: 8,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  rootPressed: {
    opacity: 0.8,
  },
  accent: {
    width: 3,
    alignSelf: 'stretch',
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
  },
  content: {
    flex: 1,
    paddingLeft: 10,
    paddingRight: 10,
    paddingVertical: 6,
  },
  siteName: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 17,
    marginBottom: 6,
  },
  photo: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
});
