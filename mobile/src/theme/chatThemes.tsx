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
  cafeLight: require('../assets/chat-themes/bg_cafe_light.png'),
  cafeDark: require('../assets/chat-themes/bg_cafe_dark.png'),
  techLight: require('../assets/chat-themes/bg_tech_light.png'),
  techDark: require('../assets/chat-themes/bg_tech_dark.png'),
  travelLight: require('../assets/chat-themes/bg_travel_light.png'),
  travelDark: require('../assets/chat-themes/bg_travel_dark.png'),
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
  wallpaperKind: 'solid' | 'default-image' | 'asset-image';
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
    /** Светлая тема по умолчанию: чистый белый фон и синий исходящий бабл. */
    bubbleMe: '#3390EC',
    bubbleMeText: '#FFFFFF',
    bubbleMeMeta: 'rgba(255,255,255,0.88)',
    /** Акценты внутри бабла (ссылки, волна голоса) — чуть темнее основного синего. */
    bubbleMeAccent: '#1976D2',
    /** Чипы реакций на своих сообщениях используют насыщенный синий. */
    reactionMeAccent: '#0D6ECA',
    replyBubbleMe: '#64A9EE',
    replyAccentMe: '#D8ECFF',
    replyTextMe: 'rgba(255,255,255,0.92)',
    replyAuthorMe: '#E7F4FF',
    forwardHeaderMeSub: 'rgba(255,255,255,0.55)',
    forwardHeaderMe: 'rgba(255,255,255,0.96)',
    deletedBubbleMe: '#D9EBFC',
    deletedTextMe: '#356B9E',
    canvasColor: '#FFFFFF',
    wallpaperKind: 'solid',
    wallpaperBase: '#FFFFFF',
    wallpaperTint: 'transparent',
    previewBadge: '×',
  },
  meadow: {
    id: 'meadow',
    name: 'Кафе',
    bubbleMe: '#B86A4F',
    bubbleMeText: '#FFFFFF',
    bubbleMeMeta: 'rgba(255,255,255,0.84)',
    bubbleMeAccent: '#8F4935',
    reactionMeAccent: '#8F4935',
    replyBubbleMe: '#D98B70',
    replyAccentMe: '#FFF0E7',
    replyTextMe: 'rgba(255,255,255,0.94)',
    replyAuthorMe: '#FFF4EC',
    forwardHeaderMeSub: 'rgba(255,255,255,0.58)',
    forwardHeaderMe: '#FFFFFF',
    deletedBubbleMe: '#F1D6C8',
    deletedTextMe: '#815241',
    canvasColor: '#FFE8D2',
    wallpaperKind: 'asset-image',
    wallpaperBase: '#FFE8D2',
    wallpaperTint: 'rgba(255,255,255,0.015)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.cafeLight,
    previewBadge: 'CA',
  },
  frost: {
    id: 'frost',
    name: 'Технологии',
    bubbleMe: '#5E73D8',
    bubbleMeText: '#FFFFFF',
    bubbleMeMeta: 'rgba(255,255,255,0.84)',
    bubbleMeAccent: '#4057BD',
    reactionMeAccent: '#4057BD',
    replyBubbleMe: '#8192E5',
    replyAccentMe: '#E9ECFF',
    replyTextMe: 'rgba(255,255,255,0.94)',
    replyAuthorMe: '#F0F2FF',
    forwardHeaderMeSub: 'rgba(255,255,255,0.58)',
    forwardHeaderMe: '#FFFFFF',
    deletedBubbleMe: '#DDE3FA',
    deletedTextMe: '#52618F',
    canvasColor: '#D6F3E3',
    wallpaperKind: 'asset-image',
    wallpaperBase: '#D6F3E3',
    wallpaperTint: 'rgba(255,255,255,0.012)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.techLight,
    previewBadge: 'IT',
  },
  sunset: {
    id: 'sunset',
    name: 'Путешествия',
    bubbleMe: '#329C98',
    bubbleMeText: '#FFFFFF',
    bubbleMeMeta: 'rgba(255,255,255,0.85)',
    bubbleMeAccent: '#197B79',
    reactionMeAccent: '#197B79',
    replyBubbleMe: '#58B8B3',
    replyAccentMe: '#E4FFFC',
    replyTextMe: 'rgba(255,255,255,0.94)',
    replyAuthorMe: '#EAFFFD',
    forwardHeaderMeSub: 'rgba(255,255,255,0.58)',
    forwardHeaderMe: '#FFFFFF',
    deletedBubbleMe: '#D6EFEC',
    deletedTextMe: '#477874',
    canvasColor: '#E6F4F8',
    wallpaperKind: 'asset-image',
    wallpaperBase: '#E6F4F8',
    wallpaperTint: 'rgba(255,255,255,0.012)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.travelLight,
    previewBadge: 'TR',
  },
};

export const CHAT_THEME_ORDER: ChatThemeId[] = ['default', 'meadow', 'frost', 'sunset'];

/** «Без темы» при тёмной теме — однотонный фон как в веб-версии Chatus. */
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
    bubbleMe: '#9D5A3D',
    bubbleMeAccent: '#F2A071',
    reactionMeAccent: '#F2A071',
    replyBubbleMe: '#6F3E33',
    replyAccentMe: '#FFD1B5',
    replyTextMe: '#FFF4ED',
    replyAuthorMe: '#FFDCC8',
    deletedBubbleMe: '#432D2B',
    deletedTextMe: 'rgba(255,255,255,0.72)',
    canvasColor: '#25162A',
    wallpaperBase: '#25162A',
    wallpaperTint: 'rgba(0,0,0,0.025)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.cafeDark,
  },
  frost: {
    ...CHAT_THEMES.frost,
    bubbleMe: '#435FC2',
    bubbleMeAccent: '#8EA8FF',
    reactionMeAccent: '#8EA8FF',
    replyBubbleMe: '#293A82',
    replyAccentMe: '#B8C7FF',
    replyTextMe: '#F0F3FF',
    replyAuthorMe: '#C7D2FF',
    deletedBubbleMe: '#202E62',
    deletedTextMe: 'rgba(255,255,255,0.72)',
    canvasColor: '#081A47',
    wallpaperBase: '#081A47',
    wallpaperTint: 'rgba(0,0,0,0.02)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.techDark,
  },
  sunset: {
    ...CHAT_THEMES.sunset,
    bubbleMe: '#247F83',
    bubbleMeAccent: '#F0A05B',
    reactionMeAccent: '#F0A05B',
    replyBubbleMe: '#1D515B',
    replyAccentMe: '#F2B172',
    replyTextMe: '#EFFDFD',
    replyAuthorMe: '#FFD0A3',
    deletedBubbleMe: '#173B46',
    deletedTextMe: 'rgba(255,255,255,0.72)',
    canvasColor: '#041E35',
    wallpaperBase: '#041E35',
    wallpaperTint: 'rgba(0,0,0,0.025)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.travelDark,
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
  const { colors: themeColors, resolvedScheme } = useTheme();
  const theme = getChatTheme(themeId, resolvedScheme);
  const wallpaper = getChatTheme(wallpaperId ?? themeId, resolvedScheme);
  const source = getChatWallpaperSource(wallpaper);

  return (
    <View
      style={[
        styles.previewCard,
        selected && { backgroundColor: themeColors.accent },
      ]}
    >
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
