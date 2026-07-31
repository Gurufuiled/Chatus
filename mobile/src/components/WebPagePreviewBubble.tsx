import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { TelegramWebPagePreview } from '../screens/telegramChat/types';
import { usePeerFirstResolvedUri } from './peerFirstMedia';
import { colors } from '../theme/colors';

type WebPagePreviewBubbleProps = {
  preview: TelegramWebPagePreview;
  /**
   * `card` — белая вложенная карточка как на iOS (исходящие).
   * `inline` — полупрозрачный блок с акцент-полосой (входящие).
   */
  variant?: 'card' | 'inline';
  accentColor?: string;
  textColor?: string;
  secondaryTextColor?: string;
  /** LineSync line id (chat id) for peer-first thumbnail fetch. */
  peerFirstLineId?: string | null;
};

export function WebPagePreviewBubble({
  preview,
  variant = 'inline',
  accentColor = '#F28C28',
  textColor,
  secondaryTextColor,
  peerFirstLineId,
}: WebPagePreviewBubbleProps) {
  const resolvedPhotoUri = usePeerFirstResolvedUri(peerFirstLineId, preview.photoUri);
  const photoUri = resolvedPhotoUri?.trim() ?? '';
  const hasPhoto = photoUri.length > 0;
  const loadingFullQuality = preview.photoFileId != null;
  const [imageLoaded, setImageLoaded] = useState(false);
  const isCard = variant === 'card';
  const resolvedTextColor = textColor ?? (isCard ? '#111827' : '#FFFFFF');
  const resolvedSecondary =
    secondaryTextColor ?? (isCard ? 'rgba(17,24,39,0.55)' : 'rgba(255,255,255,0.7)');
  const siteNameColor = isCard ? 'rgba(17,24,39,0.45)' : accentColor;

  useEffect(() => {
    setImageLoaded(false);
    if (photoUri.startsWith('data:')) {
      const t = setTimeout(() => setImageLoaded(true), 80);
      return () => clearTimeout(t);
    }
  }, [photoUri]);

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
      style={({ pressed }) => [
        styles.root,
        isCard ? styles.rootCard : styles.rootInline,
        pressed && styles.rootPressed,
      ]}
    >
      {!isCard ? <View style={[styles.accent, { backgroundColor: accentColor }]} /> : null}
      <View style={[styles.content, isCard && styles.contentCard]}>
        {preview.siteName ? (
          <Text
            style={[styles.siteName, isCard && styles.siteNameCard, { color: siteNameColor }]}
            numberOfLines={1}
          >
            {preview.siteName}
          </Text>
        ) : null}

        {preview.title ? (
          <Text style={[styles.title, { color: resolvedTextColor }]} numberOfLines={2}>
            {preview.title}
          </Text>
        ) : null}

        {preview.description ? (
          <Text style={[styles.description, { color: resolvedSecondary }]} numberOfLines={3}>
            {preview.description}
          </Text>
        ) : null}

        {hasPhoto ? (
          <View style={[styles.photoWrap, isCard && styles.photoWrapCard]}>
            {!imageLoaded ? (
              <View style={styles.photoLoader}>
                <ActivityIndicator size="large" color={colors.iconMuted} />
              </View>
            ) : null}
            {loadingFullQuality && imageLoaded ? (
              <View style={styles.photoQualityLoader}>
                <ActivityIndicator size="large" color="#FFFFFF" />
              </View>
            ) : null}
            <Image
              source={{ uri: photoUri }}
              style={styles.photo}
              contentFit="cover"
              onLoad={() => setImageLoaded(true)}
            />
          </View>
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
  },
  rootInline: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  rootCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 6,
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
  contentCard: {
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 8,
  },
  siteName: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  siteNameCard: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500',
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  description: {
    fontSize: 13,
    lineHeight: 17,
    marginBottom: 4,
  },
  photoWrap: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(243, 244, 246, 0.92)',
  },
  photoWrapCard: {
    backgroundColor: '#F3F4F6',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    backgroundColor: 'rgba(243, 244, 246, 0.92)',
  },
  photoQualityLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
});
