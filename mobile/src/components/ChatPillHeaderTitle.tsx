import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useTheme } from '../contexts/ThemeContext';
import { createTelegramStackHeaderPresentationStyles } from '../screens/telegramChat/telegramChatStyles';

type ChatPillHeaderTitleProps = {
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  blurTargetRef?: React.RefObject<View | null>;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
};

/** Telegram iOS-style centered pill: avatar + name + status. */
export function ChatPillHeaderTitle({
  title,
  subtitle,
  avatarUrl,
  blurTargetRef,
  onPress,
  disabled = false,
  accessibilityHint,
}: ChatPillHeaderTitleProps) {
  const { colors, resolvedScheme } = useTheme();
  const styles = useMemo(() => createTelegramStackHeaderPresentationStyles(colors), [colors]);
  const initialChar = (title.trim()[0] || '?').toUpperCase();
  const isLight = resolvedScheme === 'light';
  const blurProps = blurTargetRef ? { blurTarget: blurTargetRef } : {};

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        styles.pressableRow,
        pressed && onPress && !disabled ? styles.pressablePressed : null,
      ]}
    >
      <BlurView
        pointerEvents="none"
        intensity={isLight ? 44 : 36}
        tint={isLight ? 'light' : 'dark'}
        blurMethod="dimezisBlurView"
        {...blurProps}
        style={styles.pillBlurLayer}
      />
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={styles.avatar}
          contentFit="cover"
          cachePolicy="disk"
        />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarPlaceholderLetter}>{initialChar}</Text>
        </View>
      )}
      <View style={styles.titleWrap}>
        <Text style={styles.headerTitleText} numberOfLines={1} ellipsizeMode="tail">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.headerSubtitleText} numberOfLines={1} ellipsizeMode="tail">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
