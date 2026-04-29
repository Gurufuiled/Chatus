import React from 'react';
import {
  ImageBackground,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import type { ResolvedColorScheme } from './palettes';
import { useOptionalTheme, useTheme } from '../contexts/ThemeContext';

const DEFAULT_CHAT_BACKGROUND = require('../../chat/chat-bg.png');

const CHAT_THEME_IMAGE_ASSETS = {
  meadow: require('../assets/chat-themes/bg_cyberpunk_doodle.jpg'),
  frost: require('../assets/chat-themes/bg_snow_doodle.jpg'),
  sunset: require('../assets/chat-themes/bg_holiday_doodle.jpg'),
  /** Тёмная тема приложения: «ночной doodle» по умолчанию для «Без темы». */
  night: require('../assets/chat-themes/bg_night_doodle.png'),
} as const;

export type ChatThemeId = 'default' | 'meadow' | 'frost' | 'sunset';

export type ChatTheme = {
  id: ChatThemeId;
  name: string;
  bubbleMe: string;
  bubbleMeText: string;
  bubbleMeMeta: string;
  bubbleMeAccent: string;
  replyBubbleMe: string;
  replyAccentMe: string;
  replyTextMe: string;
  replyAuthorMe: string;
  /** «Переслано от» — muted line on outgoing bubbles. */
  forwardHeaderMeSub: string;
  /** Имя отправителя / акцент в блоке пересылки (исходящие). */
  forwardHeaderMe: string;
  deletedBubbleMe: string;
  deletedTextMe: string;
  canvasColor: string;
  wallpaperKind: 'default-image' | 'asset-image';
  wallpaperBase: string;
  wallpaperTint: string;
  wallpaperAsset?: ImageSourcePropType;
  previewBadge: string;
};

export const DEFAULT_CHAT_THEME_ID: ChatThemeId = 'default';

export const CHAT_THEMES: Record<ChatThemeId, ChatTheme> = {
  default: {
    id: 'default',
    name: 'Без темы',
    bubbleMe: '#3390EC',
    bubbleMeText: '#FFFFFF',
    bubbleMeMeta: 'rgba(255,255,255,0.8)',
    bubbleMeAccent: '#2B7DD1',
    replyBubbleMe: '#6A9EFF',
    replyAccentMe: '#DFF2A8',
    replyTextMe: 'rgba(255,255,255,0.88)',
    replyAuthorMe: '#FFD08A',
    forwardHeaderMeSub: 'rgba(255,255,255,0.52)',
    forwardHeaderMe: 'rgba(255,255,255,0.94)',
    deletedBubbleMe: '#D8E8F9',
    deletedTextMe: '#426789',
    canvasColor: '#E8F4D6',
    wallpaperKind: 'default-image',
    wallpaperBase: '#E8F4D6',
    wallpaperTint: 'rgba(244, 251, 224, 0.14)',
    previewBadge: '×',
  },
  meadow: {
    id: 'meadow',
    name: 'Киберпанк',
    bubbleMe: '#E0D4F6',
    bubbleMeText: '#3B1C69',
    bubbleMeMeta: 'rgba(59,28,105,0.68)',
    bubbleMeAccent: '#8B5CD6',
    replyBubbleMe: '#F0E8FA',
    replyAccentMe: '#45A8DB',
    replyTextMe: '#1E4770',
    replyAuthorMe: '#2F8FCD',
    forwardHeaderMeSub: 'rgba(16,56,92,0.48)',
    forwardHeaderMe: '#0F3A5C',
    deletedBubbleMe: '#D7ECF6',
    deletedTextMe: '#47657E',
    canvasColor: '#9366B4',
    wallpaperKind: 'asset-image',
    wallpaperBase: '#4956A6',
    wallpaperTint: 'rgba(255,255,255,0.015)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.meadow,
    previewBadge: 'CY',
  },
  frost: {
    id: 'frost',
    name: 'Снег',
    bubbleMe: '#D4E9F6',
    bubbleMeText: '#1C4469',
    bubbleMeMeta: 'rgba(28,68,105,0.68)',
    bubbleMeAccent: '#5CA1D6',
    replyBubbleMe: '#E8F4FA',
    replyAccentMe: '#6D8CDE',
    replyTextMe: '#34517D',
    replyAuthorMe: '#5E7FD6',
    forwardHeaderMeSub: 'rgba(38,63,108,0.48)',
    forwardHeaderMe: '#2A4A7A',
    deletedBubbleMe: '#E2EAF4',
    deletedTextMe: '#61708D',
    canvasColor: '#5CA1D6',
    wallpaperKind: 'asset-image',
    wallpaperBase: '#324A96',
    wallpaperTint: 'rgba(255,255,255,0.012)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.frost,
    previewBadge: 'SP',
  },
  sunset: {
    id: 'sunset',
    name: 'Новый год',
    bubbleMe: '#D4F6EE',
    bubbleMeText: '#1C695A',
    bubbleMeMeta: 'rgba(28,105,90,0.68)',
    bubbleMeAccent: '#4AD6B9',
    replyBubbleMe: '#E8FAF5',
    replyAccentMe: '#D38C2C',
    replyTextMe: '#7B561B',
    replyAuthorMe: '#C37A29',
    forwardHeaderMeSub: 'rgba(110,73,21,0.52)',
    forwardHeaderMe: '#7A4A10',
    deletedBubbleMe: '#F5E6C6',
    deletedTextMe: '#8B7140',
    canvasColor: '#88C0BA',
    wallpaperKind: 'asset-image',
    wallpaperBase: '#EAA76F',
    wallpaperTint: 'rgba(255,255,255,0.02)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.sunset,
    previewBadge: 'NY',
  },
};

export const CHAT_THEME_ORDER: ChatThemeId[] = ['default', 'meadow', 'frost', 'sunset'];

/** «Без темы» при тёмной теме приложения — обои night doodle + палитра под тёмный фон. */
const DEFAULT_CHAT_THEME_DARK: ChatTheme = {
  id: 'default',
  name: 'Без темы',
  bubbleMe: '#2B7FD6',
  bubbleMeText: '#FFFFFF',
  bubbleMeMeta: 'rgba(255,255,255,0.82)',
  bubbleMeAccent: '#5CA8FF',
  replyBubbleMe: '#3D6EA8',
  replyAccentMe: '#C8E6FF',
  replyTextMe: 'rgba(255,255,255,0.92)',
  replyAuthorMe: '#FFD699',
  forwardHeaderMeSub: 'rgba(255,255,255,0.55)',
  forwardHeaderMe: 'rgba(255,255,255,0.95)',
  deletedBubbleMe: '#2A3544',
  deletedTextMe: 'rgba(255,255,255,0.65)',
  canvasColor: '#141820',
  wallpaperKind: 'asset-image',
  wallpaperBase: '#141820',
  wallpaperTint: 'rgba(255,255,255,0.035)',
  wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.night,
  previewBadge: '×',
};

export function isChatThemeId(value: string | null | undefined): value is ChatThemeId {
  return value === 'default' || value === 'meadow' || value === 'frost' || value === 'sunset';
}

export function getChatTheme(
  themeId: string | null | undefined,
  resolvedScheme: ResolvedColorScheme = 'light',
): ChatTheme {
  const id: ChatThemeId = !themeId || !isChatThemeId(themeId) ? 'default' : themeId;
  if (id === 'default' && resolvedScheme === 'dark') {
    return DEFAULT_CHAT_THEME_DARK;
  }
  return CHAT_THEMES[id];
}

function getChatWallpaperSource(theme: ChatTheme): ImageSourcePropType {
  return theme.wallpaperKind === 'default-image' ? DEFAULT_CHAT_BACKGROUND : theme.wallpaperAsset!;
}

type ChatWallpaperProps = {
  themeId?: string | null;
  preview?: boolean;
  rounded?: boolean;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: ViewProps['pointerEvents'];
  children?: React.ReactNode;
};

export function ChatWallpaper({
  themeId,
  preview = false,
  rounded = false,
  style,
  pointerEvents = 'none',
  children,
}: ChatWallpaperProps) {
  const appTheme = useOptionalTheme();
  const resolvedScheme = appTheme?.resolvedScheme ?? 'light';
  const theme = getChatTheme(themeId, resolvedScheme);
  const source = getChatWallpaperSource(theme);
  const tintColor = preview ? 'rgba(255,255,255,0.005)' : theme.wallpaperTint;

  return (
    <View
      pointerEvents={pointerEvents}
      style={[
        styles.wallpaperRoot,
        rounded && styles.wallpaperRounded,
        { backgroundColor: theme.wallpaperBase },
        style,
      ]}
    >
      <ImageBackground
        source={source}
        resizeMode="cover"
        style={styles.wallpaperRoot}
        imageStyle={[styles.wallpaperImage, rounded && styles.wallpaperRounded]}
      >
        <View style={[styles.overlay, { backgroundColor: tintColor }]} />
        {children}
      </ImageBackground>
    </View>
  );
}

type ChatThemePreviewProps = {
  themeId: ChatThemeId;
  selected: boolean;
};

export const ChatThemePreview = React.memo(function ChatThemePreview({
  themeId,
  selected,
}: ChatThemePreviewProps) {
  const { resolvedScheme } = useTheme();
  const theme = getChatTheme(themeId, resolvedScheme);
  const source = getChatWallpaperSource(theme);

  return (
    <View style={[styles.previewCard, selected && styles.previewCardSelected]}>
      <View style={styles.previewSurface}>
        <ImageBackground
          source={source}
          resizeMode="cover"
          style={styles.previewInner}
          imageStyle={styles.previewInnerImage}
        >
          <View style={[styles.previewOverlay, { backgroundColor: 'rgba(255,255,255,0.01)' }]} />
          <View style={styles.previewGlassChip} />
          <View style={styles.previewBubbleOther} />
          <View style={[styles.previewBubbleOther, styles.previewBubbleOtherSecondary]} />
          <View style={[styles.previewBubbleMe, { backgroundColor: theme.bubbleMe }]} />
          <View style={styles.previewBadgeWrap}>
            <Text style={styles.previewBadgeText}>{theme.previewBadge}</Text>
          </View>
        </ImageBackground>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wallpaperRoot: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  wallpaperRounded: {
    borderRadius: 18,
  },
  wallpaperImage: {
    opacity: 0.99,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  previewCard: {
    width: 86,
    height: 124,
    borderRadius: 22,
    padding: 3,
    backgroundColor: 'rgba(226,232,240,0.92)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  previewCardSelected: {
    backgroundColor: '#2AA04F',
  },
  previewSurface: {
    flex: 1,
    borderRadius: 19,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  previewInner: {
    flex: 1,
  },
  previewInnerImage: {
    borderRadius: 19,
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  previewGlassChip: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 38,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  previewBubbleOther: {
    position: 'absolute',
    top: 40,
    left: 12,
    width: 44,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  previewBubbleOtherSecondary: {
    top: 64,
    width: 32,
    left: 14,
    opacity: 0.95,
  },
  previewBubbleMe: {
    position: 'absolute',
    right: 12,
    bottom: 22,
    width: 50,
    height: 18,
    borderRadius: 9,
  },
  previewBadgeWrap: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    minWidth: 28,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  previewBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.4,
  },
});
