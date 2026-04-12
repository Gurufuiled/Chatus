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

const DEFAULT_CHAT_BACKGROUND = require('../../chat/chat-bg.png');

const CHAT_THEME_IMAGE_ASSETS = {
  meadow: require('../assets/chat-themes/chatus_cyberpunk_clear.png'),
  frost: require('../assets/chat-themes/chatus_space_clear.png'),
  sunset: require('../assets/chat-themes/chatus_holiday_clear.png'),
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
    forwardHeaderMe: '#DFF2A8',
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
    name: 'Кибер',
    bubbleMe: '#A7EEFF',
    bubbleMeText: '#10385C',
    bubbleMeMeta: 'rgba(16,56,92,0.68)',
    bubbleMeAccent: '#3EB5E3',
    replyBubbleMe: '#C8F5FF',
    replyAccentMe: '#45A8DB',
    replyTextMe: '#1E4770',
    replyAuthorMe: '#2F8FCD',
    forwardHeaderMe: '#2B88C7',
    deletedBubbleMe: '#D7ECF6',
    deletedTextMe: '#47657E',
    canvasColor: '#4956A6',
    wallpaperKind: 'asset-image',
    wallpaperBase: '#4956A6',
    wallpaperTint: 'rgba(255,255,255,0.015)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.meadow,
    previewBadge: 'CY',
  },
  frost: {
    id: 'frost',
    name: 'Космос',
    bubbleMe: '#DCE6FF',
    bubbleMeText: '#263F6C',
    bubbleMeMeta: 'rgba(38,63,108,0.68)',
    bubbleMeAccent: '#6F8FE4',
    replyBubbleMe: '#E9F0FF',
    replyAccentMe: '#6D8CDE',
    replyTextMe: '#34517D',
    replyAuthorMe: '#5E7FD6',
    forwardHeaderMe: '#5877CF',
    deletedBubbleMe: '#E2EAF4',
    deletedTextMe: '#61708D',
    canvasColor: '#324A96',
    wallpaperKind: 'asset-image',
    wallpaperBase: '#324A96',
    wallpaperTint: 'rgba(255,255,255,0.012)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.frost,
    previewBadge: 'SP',
  },
  sunset: {
    id: 'sunset',
    name: 'Праздник',
    bubbleMe: '#FFE6A8',
    bubbleMeText: '#6E4915',
    bubbleMeMeta: 'rgba(110,73,21,0.66)',
    bubbleMeAccent: '#D99A33',
    replyBubbleMe: '#FFF0C7',
    replyAccentMe: '#D38C2C',
    replyTextMe: '#7B561B',
    replyAuthorMe: '#C37A29',
    forwardHeaderMe: '#B86A20',
    deletedBubbleMe: '#F5E6C6',
    deletedTextMe: '#8B7140',
    canvasColor: '#EAA76F',
    wallpaperKind: 'asset-image',
    wallpaperBase: '#EAA76F',
    wallpaperTint: 'rgba(255,255,255,0.02)',
    wallpaperAsset: CHAT_THEME_IMAGE_ASSETS.sunset,
    previewBadge: 'NY',
  },
};

export const CHAT_THEME_ORDER: ChatThemeId[] = ['default', 'meadow', 'frost', 'sunset'];

export function isChatThemeId(value: string | null | undefined): value is ChatThemeId {
  return value === 'default' || value === 'meadow' || value === 'frost' || value === 'sunset';
}

export function getChatTheme(themeId: string | null | undefined): ChatTheme {
  if (!themeId || !isChatThemeId(themeId)) {
    return CHAT_THEMES.default;
  }

  return CHAT_THEMES[themeId];
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
  const theme = getChatTheme(themeId);
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

export function ChatThemePreview({ themeId, selected }: ChatThemePreviewProps) {
  const theme = getChatTheme(themeId);
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
}

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
    width: 108,
    height: 168,
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
    width: 48,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  previewBubbleOther: {
    position: 'absolute',
    top: 40,
    left: 12,
    width: 56,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  previewBubbleOtherSecondary: {
    top: 64,
    width: 42,
    left: 18,
    opacity: 0.95,
  },
  previewBubbleMe: {
    position: 'absolute',
    right: 12,
    bottom: 22,
    width: 62,
    height: 22,
    borderRadius: 11,
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
