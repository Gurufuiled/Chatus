import React from 'react';
import { Image } from 'expo-image';
import {
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
  /** 1536² PNG (апскейл + лёгкое зерно против JPEG-полос при cover на экране). */
  mintLight: require('../assets/chat-themes/bg_mint_doodle.png'),
  mintDark: require('../assets/chat-themes/bg_mint_doodle_dark.png'),
  skyLight: require('../assets/chat-themes/bg_sky_doodle.png'),
  skyDark: require('../assets/chat-themes/bg_sky_doodle_dark.png'),
  peachLight: require('../assets/chat-themes/bg_peach_doodle.png'),
  peachDark: require('../assets/chat-themes/bg_peach_doodle_dark.png'),
  /** Светлая «Без темы»: `bg_default_light_doodle` (арт preview wall_light_v2) + `@2x`/`@3x`. */
  defaultLightDoodle: require('../assets/chat-themes/bg_default_light_doodle.png'),
  /** Тёмная «Без темы»: `bg_night_doodle` (арт preview wall_dark_v1) + `@2x`/`@3x`. */
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
  /** Исходящие: чипы реакций; если не задан — `bubbleMeAccent`. */
  reactionMeAccent?: string;
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
  wallpaperKind: 'default-image' | 'asset-image' | 'solid';
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
    /** Исходящий бабл — зелёный как в Telegram под дефолтные зелёные обои. */
    bubbleMe: '#5CBF4F',
    bubbleMeText: '#FFFFFF',
    bubbleMeMeta: 'rgba(255,255,255,0.88)',
    /** Акценты внутри бабла (ссылки, волна голоса) — чуть темнее основного зелёного. */
    bubbleMeAccent: '#3A9A3A',
    /** Чипы реакций на своих сообщениях — заметнее «кислотный» зелёный. */
    reactionMeAccent: '#00C853',
    replyBubbleMe: '#7FD96E',
    replyAccentMe: '#FFF9C4',
    replyTextMe: 'rgba(255,255,255,0.92)',
    replyAuthorMe: '#FFF3B0',
    forwardHeaderMeSub: 'rgba(255,255,255,0.55)',
    forwardHeaderMe: 'rgba(255,255,255,0.96)',
    deletedBubbleMe: '#C8E6C9',
    deletedTextMe: '#2E6B32',
    canvasColor: '#E6F2EE',
    wallpaperKind: 'asset-image',
    wallpaperBase: '#DDECE8',
    wallpaperTint: 'rgba(255, 255, 255, 0.06)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.defaultLightDoodle,
    previewBadge: '×',
  },
  meadow: {
    id: 'meadow',
    name: 'Киберпанк',
    bubbleMe: '#4DAF81',
    bubbleMeText: '#FFFFFF',
    bubbleMeMeta: 'rgba(255,255,255,0.82)',
    bubbleMeAccent: '#2F8F64',
    replyBubbleMe: '#75C89B',
    replyAccentMe: '#D8F8E4',
    replyTextMe: 'rgba(255,255,255,0.92)',
    replyAuthorMe: '#E2FFE9',
    forwardHeaderMeSub: 'rgba(255,255,255,0.55)',
    forwardHeaderMe: '#FFFFFF',
    deletedBubbleMe: '#D8F0DE',
    deletedTextMe: '#39715A',
    canvasColor: '#D8F1D9',
    wallpaperKind: 'asset-image',
    wallpaperBase: '#D8F1D9',
    wallpaperTint: 'rgba(255,255,255,0.035)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.mintLight,
    previewBadge: 'М',
    ...{ name: 'Мята' },
  },
  frost: {
    id: 'frost',
    name: 'Снег',
    bubbleMe: '#6C7FD3',
    bubbleMeText: '#FFFFFF',
    bubbleMeMeta: 'rgba(255,255,255,0.82)',
    bubbleMeAccent: '#5064BD',
    replyBubbleMe: '#8F9DDF',
    replyAccentMe: '#E4E9FF',
    replyTextMe: 'rgba(255,255,255,0.92)',
    replyAuthorMe: '#EEF0FF',
    forwardHeaderMeSub: 'rgba(255,255,255,0.55)',
    forwardHeaderMe: '#FFFFFF',
    deletedBubbleMe: '#E6EBFA',
    deletedTextMe: '#5A6888',
    canvasColor: '#D7E5FC',
    wallpaperKind: 'asset-image',
    wallpaperBase: '#D7E5FC',
    wallpaperTint: 'rgba(255,255,255,0.03)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.skyLight,
    previewBadge: 'Н',
    ...{ name: 'Небо' },
  },
  sunset: {
    id: 'sunset',
    name: 'Новый год',
    bubbleMe: '#D87A68',
    bubbleMeText: '#FFFFFF',
    bubbleMeMeta: 'rgba(255,255,255,0.84)',
    bubbleMeAccent: '#B85E50',
    replyBubbleMe: '#E89988',
    replyAccentMe: '#FFE7DF',
    replyTextMe: 'rgba(255,255,255,0.92)',
    replyAuthorMe: '#FFF1EB',
    forwardHeaderMeSub: 'rgba(255,255,255,0.55)',
    forwardHeaderMe: '#FFFFFF',
    deletedBubbleMe: '#F7E4DB',
    deletedTextMe: '#8D6258',
    canvasColor: '#FFE5D8',
    wallpaperKind: 'asset-image',
    wallpaperBase: '#FFE5D8',
    wallpaperTint: 'rgba(255,255,255,0.035)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.peachLight,
    previewBadge: 'П',
    ...{ name: 'Персик' },
  },
};

export const CHAT_THEME_ORDER: ChatThemeId[] = ['default', 'meadow', 'frost', 'sunset'];

/** «Без темы» при тёмной теме — `bg_night_doodle` (wall_dark_v1) + `@2x`/`@3x`. */
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
  canvasColor: '#0E1621',
  wallpaperKind: 'solid',
  wallpaperBase: '#0E1621',
  wallpaperTint: 'transparent',
  previewBadge: '×',
};

const CHAT_THEMES_DARK: Record<'meadow' | 'frost' | 'sunset', ChatTheme> = {
  meadow: {
    ...CHAT_THEMES.meadow,
    bubbleMe: '#247D77',
    bubbleMeText: '#FFFFFF',
    bubbleMeMeta: 'rgba(255,255,255,0.82)',
    bubbleMeAccent: '#7DD9C4',
    replyBubbleMe: '#1A3338',
    replyAccentMe: '#7DD9C4',
    replyTextMe: '#E3F4EE',
    replyAuthorMe: '#8EE1CB',
    forwardHeaderMeSub: 'rgba(255,255,255,0.55)',
    forwardHeaderMe: '#FFFFFF',
    deletedBubbleMe: '#1E3D42',
    deletedTextMe: 'rgba(255,255,255,0.72)',
    canvasColor: '#0D4D50',
    wallpaperBase: '#0D4D50',
    wallpaperTint: 'rgba(0,0,0,0.03)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.mintDark,
  },
  frost: {
    ...CHAT_THEMES.frost,
    bubbleMe: '#536DC5',
    bubbleMeText: '#FFFFFF',
    bubbleMeMeta: 'rgba(255,255,255,0.82)',
    bubbleMeAccent: '#9EAEFF',
    replyBubbleMe: '#1F2B54',
    replyAccentMe: '#9EAEFF',
    replyTextMe: '#E7EBFF',
    replyAuthorMe: '#AAB7FF',
    forwardHeaderMeSub: 'rgba(255,255,255,0.55)',
    forwardHeaderMe: '#FFFFFF',
    deletedBubbleMe: '#252F58',
    deletedTextMe: 'rgba(255,255,255,0.72)',
    canvasColor: '#17245E',
    wallpaperBase: '#17245E',
    wallpaperTint: 'rgba(0,0,0,0.035)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.skyDark,
  },
  sunset: {
    ...CHAT_THEMES.sunset,
    bubbleMe: '#A66A52',
    bubbleMeText: '#FFFFFF',
    bubbleMeMeta: 'rgba(255,255,255,0.84)',
    bubbleMeAccent: '#F0B786',
    replyBubbleMe: '#30272E',
    replyAccentMe: '#F0B786',
    replyTextMe: '#F6EAE4',
    replyAuthorMe: '#F1B68B',
    forwardHeaderMeSub: 'rgba(255,255,255,0.55)',
    forwardHeaderMe: '#FFFFFF',
    deletedBubbleMe: '#3A2D34',
    deletedTextMe: 'rgba(255,255,255,0.72)',
    canvasColor: '#30252F',
    wallpaperBase: '#30252F',
    wallpaperTint: 'rgba(0,0,0,0.04)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.peachDark,
  },
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
  if (resolvedScheme === 'dark' && id !== 'default') {
    return CHAT_THEMES_DARK[id];
  }
  return CHAT_THEMES[id];
}

/** Акцент для чипов реакций на исходящих (если задан `reactionMeAccent`). */
export function getOutgoingReactionAccent(theme: ChatTheme): string {
  return theme.reactionMeAccent ?? theme.bubbleMeAccent;
}

function getChatWallpaperSource(theme: ChatTheme): ImageSourcePropType | null {
  if (theme.wallpaperKind === 'solid') return null;
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
      {source ? (
        <Image
          source={source}
          contentFit="cover"
          style={[
            styles.wallpaperImageOverscan,
            styles.wallpaperImage,
            rounded && styles.wallpaperRounded,
          ]}
          cachePolicy="memory-disk"
          transition={0}
        />
      ) : null}
      <View style={[styles.overlay, { backgroundColor: tintColor }]} />
      {children}
    </View>
  );
}

type ChatThemePreviewProps = {
  themeId: ChatThemeId;
  wallpaperId?: ChatThemeId;
  selected: boolean;
};

export const ChatThemePreview = React.memo(function ChatThemePreview({
  themeId,
  wallpaperId,
  selected,
}: ChatThemePreviewProps) {
  const { resolvedScheme } = useTheme();
  const theme = getChatTheme(themeId, resolvedScheme);
  const wallpaper = getChatTheme(wallpaperId ?? themeId, resolvedScheme);
  const source = getChatWallpaperSource(wallpaper);

  return (
    <View style={[styles.previewCard, selected && styles.previewCardSelected]}>
      <View style={[styles.previewSurface, { backgroundColor: wallpaper.wallpaperBase }]}>
        <View style={styles.previewInner}>
          {source ? (
            <Image
              source={source}
              contentFit="cover"
              style={[StyleSheet.absoluteFillObject, styles.previewInnerImage]}
              cachePolicy="memory-disk"
              transition={0}
            />
          ) : null}
          <View style={[styles.previewOverlay, { backgroundColor: 'rgba(255,255,255,0.01)' }]} />
          <View style={styles.previewGlassChip} />
          <View style={styles.previewBubbleOther} />
          <View style={[styles.previewBubbleOther, styles.previewBubbleOtherSecondary]} />
          <View style={[styles.previewBubbleMe, { backgroundColor: theme.bubbleMe }]} />
          <View style={styles.previewBadgeWrap}>
            <Text style={styles.previewBadgeText}>{theme.previewBadge}</Text>
          </View>
        </View>
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
  /** Чуть больше экрана — убирает редкие 1px «полоски» по краю при cover + субпикселях. */
  wallpaperImageOverscan: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
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
