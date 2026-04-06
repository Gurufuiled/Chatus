import React from 'react';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import {
  ImageBackground,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SvgXml } from 'react-native-svg';

const DEFAULT_CHAT_BACKGROUND = require('../../chat/chat-bg.png');

const CHAT_THEME_SVG_ASSETS = {
  meadow: require('../assets/chat-themes/chatus_theme_strict_blue_mint.svg'),
  frost: require('../assets/chat-themes/chatus_telegram_style_lilac.svg'),
  sunset: require('../assets/chat-themes/chatus_theme_peach_unicorn.svg'),
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
  wallpaperKind: 'default-image' | 'asset-svg';
  wallpaperBase: string;
  wallpaperTint: string;
  wallpaperAssetModule?: number;
  previewBadge: string;
};

export const DEFAULT_CHAT_THEME_ID: ChatThemeId = 'default';

export const CHAT_THEMES: Record<ChatThemeId, ChatTheme> = {
  default: {
    id: 'default',
    name: 'Без темы',
    bubbleMe: '#4D8DFF',
    bubbleMeText: '#FFFFFF',
    bubbleMeMeta: 'rgba(255,255,255,0.8)',
    bubbleMeAccent: '#2E73F3',
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
    wallpaperTint: 'rgba(244, 251, 224, 0.16)',
    previewBadge: '✕',
  },
  meadow: {
    id: 'meadow',
    name: 'Минт',
    bubbleMe: '#B7E7DB',
    bubbleMeText: '#27515A',
    bubbleMeMeta: 'rgba(39,81,90,0.68)',
    bubbleMeAccent: '#4E95A4',
    replyBubbleMe: '#D4F2EB',
    replyAccentMe: '#4C8E9C',
    replyTextMe: '#355E68',
    replyAuthorMe: '#4D8996',
    forwardHeaderMe: '#4A8898',
    deletedBubbleMe: '#E2F0ED',
    deletedTextMe: '#5A7480',
    canvasColor: '#DCEAE6',
    wallpaperKind: 'asset-svg',
    wallpaperBase: '#DCEAE6',
    wallpaperTint: 'rgba(255,255,255,0.02)',
    wallpaperAssetModule: CHAT_THEME_SVG_ASSETS.meadow,
    previewBadge: '🌿',
  },
  frost: {
    id: 'frost',
    name: 'Лилак',
    bubbleMe: '#E3D6FF',
    bubbleMeText: '#5C4683',
    bubbleMeMeta: 'rgba(92,70,131,0.68)',
    bubbleMeAccent: '#A97ED1',
    replyBubbleMe: '#EFE6FF',
    replyAccentMe: '#A579CF',
    replyTextMe: '#684F90',
    replyAuthorMe: '#A070C8',
    forwardHeaderMe: '#9E70C5',
    deletedBubbleMe: '#EEE8F8',
    deletedTextMe: '#76638E',
    canvasColor: '#E9DDF4',
    wallpaperKind: 'asset-svg',
    wallpaperBase: '#E9DDF4',
    wallpaperTint: 'rgba(255,255,255,0.02)',
    wallpaperAssetModule: CHAT_THEME_SVG_ASSETS.frost,
    previewBadge: '💎',
  },
  sunset: {
    id: 'sunset',
    name: 'Пич',
    bubbleMe: '#FFE1C2',
    bubbleMeText: '#7B4E31',
    bubbleMeMeta: 'rgba(123,78,49,0.64)',
    bubbleMeAccent: '#D58C63',
    replyBubbleMe: '#FFEAD8',
    replyAccentMe: '#D88760',
    replyTextMe: '#87563A',
    replyAuthorMe: '#CB7A59',
    forwardHeaderMe: '#C66E54',
    deletedBubbleMe: '#F8E8DD',
    deletedTextMe: '#90705B',
    canvasColor: '#F4E2DB',
    wallpaperKind: 'asset-svg',
    wallpaperBase: '#F4E2DB',
    wallpaperTint: 'rgba(255,255,255,0.015)',
    wallpaperAssetModule: CHAT_THEME_SVG_ASSETS.sunset,
    previewBadge: '🦄',
  },
};

export const CHAT_THEME_ORDER: ChatThemeId[] = ['default', 'meadow', 'frost', 'sunset'];

const svgXmlCache = new Map<number, string>();
const svgXmlPromiseCache = new Map<number, Promise<string>>();

async function loadSvgXmlFromModule(moduleId: number): Promise<string> {
  const cached = svgXmlCache.get(moduleId);
  if (cached) {
    return cached;
  }

  const existingPromise = svgXmlPromiseCache.get(moduleId);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async () => {
    const asset = Asset.fromModule(moduleId);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;

    if (!uri) {
      throw new Error(`Missing local uri for chat theme asset ${moduleId}`);
    }

    const xml = await FileSystem.readAsStringAsync(uri);
    svgXmlCache.set(moduleId, xml);
    svgXmlPromiseCache.delete(moduleId);
    return xml;
  })().catch((error) => {
    svgXmlPromiseCache.delete(moduleId);
    throw error;
  });

  svgXmlPromiseCache.set(moduleId, promise);
  return promise;
}

function useChatWallpaperSvg(theme: ChatTheme) {
  const moduleId = theme.wallpaperAssetModule;
  const [svgXml, setSvgXml] = React.useState<string | null>(() =>
    moduleId ? svgXmlCache.get(moduleId) ?? null : null,
  );

  React.useEffect(() => {
    let isActive = true;

    if (!moduleId) {
      setSvgXml(null);
      return () => {
        isActive = false;
      };
    }

    const cached = svgXmlCache.get(moduleId);
    if (cached) {
      setSvgXml((current) => (current === cached ? current : cached));
      return () => {
        isActive = false;
      };
    }

    loadSvgXmlFromModule(moduleId)
      .then((xml) => {
        if (isActive) {
          setSvgXml(xml);
        }
      })
      .catch(() => {
        if (isActive) {
          setSvgXml(null);
        }
      });

    return () => {
      isActive = false;
    };
  }, [moduleId]);

  return svgXml;
}

export function isChatThemeId(value: string | null | undefined): value is ChatThemeId {
  return value === 'default' || value === 'meadow' || value === 'frost' || value === 'sunset';
}

export function getChatTheme(themeId: string | null | undefined): ChatTheme {
  if (!themeId || !isChatThemeId(themeId)) {
    return CHAT_THEMES.default;
  }

  return CHAT_THEMES[themeId];
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
  rounded = false,
  style,
  pointerEvents = 'none',
  children,
}: ChatWallpaperProps) {
  const theme = getChatTheme(themeId);
  const svgXml = useChatWallpaperSvg(theme);

  if (theme.wallpaperKind === 'default-image') {
    return (
      <View
        pointerEvents={pointerEvents}
        style={[styles.wallpaperRoot, rounded && styles.wallpaperRounded, style]}
      >
        <ImageBackground
          source={DEFAULT_CHAT_BACKGROUND}
          resizeMode="cover"
          style={styles.wallpaperRoot}
          imageStyle={styles.defaultImage}
        >
          <View style={[styles.overlay, { backgroundColor: theme.wallpaperTint }]} />
          {children}
        </ImageBackground>
      </View>
    );
  }

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
      {svgXml ? (
        <View pointerEvents="none" style={styles.svgFill}>
          <SvgXml xml={svgXml} width="100%" height="100%" />
        </View>
      ) : null}
      <View style={[styles.overlay, { backgroundColor: theme.wallpaperTint }]} />
      {children}
    </View>
  );
}

type ChatThemePreviewProps = {
  themeId: ChatThemeId;
  selected: boolean;
};

export function ChatThemePreview({ themeId, selected }: ChatThemePreviewProps) {
  const theme = getChatTheme(themeId);

  if (themeId === 'default') {
    return (
      <View style={[styles.previewCard, selected && styles.previewCardSelected]}>
        <View style={styles.defaultThemeCard}>
          <Text style={styles.defaultThemeText}>Без темы</Text>
          <Text style={styles.defaultThemeCross}>✕</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.previewCard, selected && styles.previewCardSelected]}>
      <ChatWallpaper themeId={themeId} preview rounded style={styles.previewSurface} pointerEvents="none">
        <View style={styles.previewBubbleOther} />
        <View style={[styles.previewBubbleOther, styles.previewBubbleOtherSecondary]} />
        <View style={[styles.previewBubbleMe, { backgroundColor: theme.bubbleMe }]} />
        <View style={styles.previewBadgeWrap}>
          <Text style={styles.previewBadgeText}>{theme.previewBadge}</Text>
        </View>
      </ChatWallpaper>
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
  defaultImage: {
    opacity: 0.92,
  },
  svgFill: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  previewCard: {
    width: 88,
    height: 122,
    borderRadius: 18,
    padding: 3,
    backgroundColor: 'rgba(226,232,240,0.92)',
  },
  previewCardSelected: {
    backgroundColor: '#2AA04F',
  },
  previewSurface: {
    position: 'relative',
  },
  defaultThemeCard: {
    flex: 1,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  defaultThemeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2C6B3D',
    textAlign: 'center',
    lineHeight: 18,
  },
  defaultThemeCross: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '800',
    color: '#E53935',
  },
  previewBubbleOther: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 44,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  previewBubbleOtherSecondary: {
    top: 31,
    width: 34,
    left: 18,
    opacity: 0.94,
  },
  previewBubbleMe: {
    position: 'absolute',
    right: 12,
    bottom: 18,
    width: 50,
    height: 18,
    borderRadius: 9,
  },
  previewBadgeWrap: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  previewBadgeText: {
    fontSize: 12,
    lineHeight: 14,
  },
});
