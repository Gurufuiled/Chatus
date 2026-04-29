# One-off: migrate ChannelFeedScreen to useTheme + createChannelFeedStyles. Run from repo root:
#   python mobile/scripts/patch_channel_feed_theme.py
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "src" / "screens" / "ChannelFeedScreen.tsx"

INSERT_AFTER = """type ChannelAlbumOptions = {
  visualMediaWidth?: number;
  onTilePress?: (index: number) => void;
};
"""

FACTORY = r'''
type ChannelAlbumOptions = {
  visualMediaWidth?: number;
  onTilePress?: (index: number) => void;
  /** Muted icon on album tile fallback (theme). */
  mutedIcon?: string;
};

type ChannelFeedStyles = ReturnType<typeof createChannelFeedStyles>;

function createChannelFeedStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.chatBackground,
    },
    listWrap: {
      flex: 1,
    },
    inputBarWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
    },
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.chatBackground,
    },
    list: {
      paddingHorizontal: 8,
      paddingTop: 8,
    },
    listWithoutComposer: {
      paddingBottom: 24,
    },
    postWrap: {
      marginBottom: 8,
      width: '100%',
      alignSelf: 'stretch',
      alignItems: 'flex-start',
    },
    postBubble: {
      maxWidth: '90%',
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 8,
      alignItems: 'flex-start',
      backgroundColor: c.bubbleOther,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.bubbleOtherBorder,
      borderRadius: 12,
    },
    postBubbleVisualMedia: {
      alignSelf: 'flex-start',
      alignItems: 'stretch',
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 0,
      overflow: 'hidden',
    },
    postBubbleVoice: {
      paddingHorizontal: 6,
      paddingTop: 6,
      paddingBottom: 6,
    },
    menuPreviewBubble: {
      maxWidth: '90%',
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 8,
      alignItems: 'flex-start',
      backgroundColor: c.bubbleOther,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.bubbleOtherBorder,
      overflow: 'hidden',
      borderRadius: 12,
    },
    mediaContentWrap: {
      width: '100%',
      alignSelf: 'stretch',
      alignItems: 'center',
    },
    channelAlbumClip: {
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: c.placeholderBg,
    },
    channelAlbumRow: {
      flexDirection: 'row',
      gap: 1.5,
    },
    channelAlbumColumn: {
      gap: 1.5,
    },
    channelAlbumGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 1.5,
    },
    channelAlbumTile: {
      overflow: 'hidden',
      backgroundColor: c.inputBackground,
    },
    channelAlbumTilePressed: {
      opacity: 0.92,
    },
    channelAlbumImage: {
      width: '100%',
      height: '100%',
    },
    channelAlbumImageFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.inputBackgroundSolid,
    },
    channelAlbumVideoBadge: {
      position: 'absolute',
      left: 6,
      bottom: 6,
      minHeight: 20,
      borderRadius: 999,
      paddingHorizontal: 7,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(15,23,42,0.68)',
    },
    channelAlbumVideoDuration: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    channelAlbumExtraOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(15,23,42,0.42)',
    },
    channelAlbumExtraText: {
      fontSize: 22,
      lineHeight: 26,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    channelAlbumMetaOverlay: {
      position: 'absolute',
      right: 6,
      bottom: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(15, 23, 42, 0.52)',
    },
    channelAlbumMetaText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    postActionsRowMedia: {
      alignSelf: 'stretch',
      width: '100%',
      paddingHorizontal: 10,
      paddingBottom: 10,
      marginTop: 4,
    },
    postActionsRowPreviewMedia: {
      width: '100%',
      alignSelf: 'stretch',
      paddingHorizontal: 10,
      marginRight: 0,
      paddingRight: 10,
    },
    postText: {
      color: c.textPrimary,
      fontSize: 16,
      lineHeight: 20,
    },
    mediaCaptionBlock: {
      alignSelf: 'stretch',
      paddingHorizontal: 10,
      paddingTop: 4,
    },
    mediaCaptionText: {
      color: c.textPrimary,
      fontSize: 16,
      lineHeight: 20,
    },
    mediaCaptionMetaRight: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-end',
    },
    postFooter: {
      alignSelf: 'flex-end',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 5,
    },
    footerMetric: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    metaText: {
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    postActionsRow: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: withAlpha(c.textSecondary, 0.28),
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: 6,
    },
    discussionPill: {
      minHeight: 32,
      paddingHorizontal: 10,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 5,
      backgroundColor: withAlpha(c.inputBackgroundSolid, 0.92),
      alignSelf: 'stretch',
    },
    discussionPillMedia: {
      borderRadius: 0,
      backgroundColor: 'transparent',
      paddingHorizontal: 0,
      justifyContent: 'flex-start',
    },
    discussionPillPressed: {
      opacity: 0.82,
    },
    discussionPillPreview: {
      width: '100%',
      minHeight: 28,
      paddingHorizontal: 0,
      borderRadius: 0,
      backgroundColor: 'transparent',
      justifyContent: 'space-between',
    },
    discussionPreviewLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginLeft: 10,
    },
    discussionPreviewChevron: {
      marginRight: 4,
    },
    discussionLink: {
      color: c.accent,
      fontSize: 12,
      fontWeight: '700',
      flexShrink: 0,
    },
    reactionSummaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 2,
      paddingHorizontal: 2,
    },
    reactionSummaryText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    reactionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    reactionButton: {
      borderRadius: 8,
      paddingHorizontal: 0,
      minHeight: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    reactionButtonActive: {
      backgroundColor: withAlpha(c.accent, 0.14),
    },
    reactionButtonPressed: {
      opacity: 0.72,
    },
    reactionText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    emptyText: {
      marginTop: 40,
      textAlign: 'center',
      color: c.textSecondary,
      fontWeight: '600',
    },
    privateGateWrap: {
      flex: 1,
      paddingHorizontal: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    privateGateAvatar: {
      width: 88,
      height: 88,
      borderRadius: 44,
      marginBottom: 14,
    },
    privateGateAvatarPlaceholder: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: c.iconMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    privateGateAvatarLetter: {
      fontSize: 36,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    privateGateTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: c.textPrimary,
      textAlign: 'center',
    },
    privateGateDesc: {
      marginTop: 8,
      fontSize: 16,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    privateGateHint: {
      marginTop: 16,
      fontSize: 15,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
    },
    privateGateButton: {
      marginTop: 22,
      minWidth: 200,
      paddingHorizontal: 28,
      paddingVertical: 14,
      borderRadius: 999,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    privateGateButtonPressed: { opacity: 0.88 },
    privateGateButtonDisabled: { opacity: 0.65 },
    privateGateButtonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
    },
    subscribePillWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    subscribePill: {
      paddingHorizontal: 28,
      paddingVertical: 12,
      borderRadius: 999,
      backgroundColor: c.accent,
      minWidth: 160,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    subscribePillPressed: { opacity: 0.9 },
    subscribePillDisabled: { opacity: 0.65 },
    subscribePillText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
  });
}

'''

ALBUM_HELPERS = r'''/** Album tiles must load remote URLs without gallery permission — show fallback on failure instead of blank white. */
function ChannelAlbumTileImage({
  uri,
  st,
  mutedIcon,
}: {
  uri: string;
  st: ChannelFeedStyles;
  mutedIcon: string;
}) {
  const [failed, setFailed] = React.useState(false);
  if (failed) {
    return (
      <View style={[st.channelAlbumImage, st.channelAlbumImageFallback]}>
        <MaterialCommunityIcons name="image-off-outline" size={24} color={mutedIcon} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={st.channelAlbumImage}
      contentFit="cover"
      cachePolicy="disk"
      onError={() => setFailed(true)}
    />
  );
}

function renderChannelMediaAlbum(
  item: Message,
  time: string,
  st: ChannelFeedStyles,
  options?: ChannelAlbumOptions,
) {
  const media = (item.media ?? []).filter((entry) => entry.remote_url?.trim()).slice(0, 10);
  if (media.length <= 1) return null;

  const visibleMedia = media.slice(0, 9);
  const albumWidth = Math.max(
    120,
    Math.min(options?.visualMediaWidth ?? CHANNEL_MEDIA_MAX_WIDTH, CHANNEL_MEDIA_MAX_WIDTH),
  );
  const onTilePress = options?.onTilePress;
  const gap = 1.5;
  const caption = item.content?.trim() ?? '';
  const hasCaption = caption.length > 0;
  const mutedIcon = options?.mutedIcon ?? '#9CA3AF';

  const renderTile = (mediaItem: VisualMediaItem, index: number, style: object) => {
    const kind = getVisualMediaKind(item, mediaItem);
    const rawUri =
      kind === 'video'
        ? mediaItem.thumbnail_url || mediaItem.remote_url
        : mediaItem.remote_url;
    const uri = resolveMediaUrl(rawUri ?? null) ?? rawUri ?? '';
    const extraCount = media.length - visibleMedia.length;
    const showExtra = index === visibleMedia.length - 1 && extraCount > 0;

    const tileContent = (
      <>
        <ChannelAlbumTileImage uri={uri} st={st} mutedIcon={mutedIcon} />
        {kind === 'video' ? (
          <View style={st.channelAlbumVideoBadge}>
            <Feather name="play" size={10} color="#FFFFFF" />
            <Text style={st.channelAlbumVideoDuration}>
              {formatMediaDuration(mediaItem.duration_ms ?? 0)}
            </Text>
          </View>
        ) : null}
        {showExtra ? (
          <View style={st.channelAlbumExtraOverlay}>
            <Text style={st.channelAlbumExtraText}>+{extraCount}</Text>
          </View>
        ) : null}
      </>
    );

    if (onTilePress) {
      return (
        <Pressable
          key={`${mediaItem.remote_url}-${index}`}
          onPress={() => onTilePress(index)}
          style={({ pressed }) => [
            st.channelAlbumTile,
            style,
            pressed && st.channelAlbumTilePressed,
          ]}
        >
          {tileContent}
        </Pressable>
      );
    }

    return (
      <View key={`${mediaItem.remote_url}-${index}`} style={[st.channelAlbumTile, style]}>
        {tileContent}
      </View>
    );
  };

  const grid = (() => {
    if (visibleMedia.length === 2) {
      const tileWidth = (albumWidth - gap) / 2;
      return (
        <View style={st.channelAlbumRow}>
          {visibleMedia.map((mediaItem, index) =>
            renderTile(mediaItem, index, { width: tileWidth, height: albumWidth })
          )}
        </View>
      );
    }

    if (visibleMedia.length === 3) {
      const sideWidth = (albumWidth - gap) * 0.58;
      const rightWidth = albumWidth - sideWidth - gap;
      const halfHeight = (albumWidth - gap) / 2;
      return (
        <View style={st.channelAlbumRow}>
          {renderTile(visibleMedia[0], 0, { width: sideWidth, height: albumWidth })}
          <View style={[st.channelAlbumColumn, { width: rightWidth }]}>
            {renderTile(visibleMedia[1], 1, { width: rightWidth, height: halfHeight })}
            {renderTile(visibleMedia[2], 2, { width: rightWidth, height: halfHeight })}
          </View>
        </View>
      );
    }

    const columns = 3;
    const tileWidth = (albumWidth - gap * (columns - 1)) / columns;
    return (
      <View style={st.channelAlbumGrid}>
        {visibleMedia.map((mediaItem, index) =>
          renderTile(mediaItem, index, { width: tileWidth, height: tileWidth })
        )}
      </View>
    );
  })();

  return (
    <>
      <View style={[st.channelAlbumClip, { width: albumWidth }]}>
        {grid}
        {!hasCaption ? (
          <View style={st.channelAlbumMetaOverlay}>
            <View style={st.footerMetric}>
              <Feather name="eye" size={13} color="#FFFFFF" />
              <Text style={st.channelAlbumMetaText}>{item.view_count ?? 0}</Text>
            </View>
            <Text style={st.channelAlbumMetaText}>{time}</Text>
          </View>
        ) : null}
      </View>
      {hasCaption ? (
        <View style={st.mediaCaptionBlock}>
          <Text style={st.mediaCaptionText}>{caption}</Text>
          <View style={st.mediaCaptionMetaRight}>
            <Feather name="eye" size={13} color={mutedIcon} />
            <Text style={st.metaText}>{item.view_count ?? 0}</Text>
            <Text style={st.metaText}>{time}</Text>
          </View>
        </View>
      ) : null}
    </>
  );
}

'''


def main() -> None:
    text = PATH.read_text(encoding="utf-8")

    if "function createChannelFeedStyles" in text:
        print("Already patched, skip")
        return

    if INSERT_AFTER not in text:
        raise SystemExit("marker not found")

    # Remove trailing const styles = StyleSheet.create({ ... });
    m = re.search(r"\nconst styles = StyleSheet\.create\(\{", text)
    if not m:
        raise SystemExit("styles block not found")
    end = text.rfind("\n});")
    if end == -1 or end < m.start():
        raise SystemExit("styles block end not found")
    # include closing `});`
    text = text[: m.start()] + "\n" + text[end + len("\n});") :]

    # Replace ChannelAlbumOptions + old helpers with FACTORY + ALBUM_HELPERS
    old_album_start = text.find("/** Album tiles must load remote URLs")
    if old_album_start == -1:
        raise SystemExit("album comment not found")
    old_build = text.find("function buildOptimisticMessage", old_album_start)
    if old_build == -1:
        raise SystemExit("buildOptimisticMessage not found")
    text = text[:old_album_start] + ALBUM_HELPERS + "\n" + text[old_build:]

    if INSERT_AFTER not in text:
        raise SystemExit("marker lost")
    text = text.replace(INSERT_AFTER, FACTORY, 1)

    # imports
    text = text.replace("import React from 'react';", "import React, { useMemo } from 'react';", 1)
    text = text.replace(
        "import { bubbleRadius, colors } from '../theme/colors';",
        "import type { ThemeColors } from '../theme/palettes';\nimport { withAlpha } from '../theme/stylePrimitives';",
        1,
    )

    # Screen hooks
    text = text.replace(
        "export function ChannelFeedScreen() {\n  const navigation = useNavigation<Nav>();\n  const isFocused = useIsFocused();\n  const route = useRoute<Route>();\n  const { colors: themeMenuColors } = useTheme();",
        "export function ChannelFeedScreen() {\n  const { colors: c } = useTheme();\n  const styles = useMemo(() => createChannelFeedStyles(c), [c]);\n  const navigation = useNavigation<Nav>();\n  const isFocused = useIsFocused();\n  const route = useRoute<Route>();",
        1,
    )
    text = text.replace("themeMenuColors", "c")

    text = text.replace("colors.accent", "c.accent")

    text = text.replace(
        "return renderChannelMediaAlbum(item, time, {\n          visualMediaWidth: options?.visualMediaWidth,\n          onTilePress: (idx) => openChannelFeedMediaViewer(item, idx),\n        });",
        "return renderChannelMediaAlbum(item, time, styles, {\n          visualMediaWidth: options?.visualMediaWidth,\n          onTilePress: (idx) => openChannelFeedMediaViewer(item, idx),\n          mutedIcon: c.textSecondary,\n        });",
        1,
    )

    text = text.replace(
        "    [openChannelFeedMediaViewer]\n  );",
        "    [openChannelFeedMediaViewer, styles, c]\n  );",
        1,
    )

    text = text.replace(
        "    [canComment, detail?.channel, channelId, navigation],\n  );\n\n  const renderPostExtrasPreview",
        "    [canComment, detail?.channel, channelId, navigation, styles, c],\n  );\n\n  const renderPostExtrasPreview",
        1,
    )
    text = text.replace(
        "    [canComment, detail?.channel, channelId, navigation],\n  );\n\n  const renderPost =",
        "    [canComment, detail?.channel, channelId, navigation, styles, c],\n  );\n\n  const renderPost =",
        1,
    )

    # chatStore selector shadowing: (c) -> (chat)
    text = text.replace(
        "state.chats.find((c) => c.id === channelId)",
        "state.chats.find((chat) => chat.id === channelId)",
        1,
    )

    # Inline eye icons in renderPostContent -> c.textSecondary (3 occurrences of #68849A in that block still ok or replace)
    text = text.replace('color="#68849A"', "color={c.textSecondary}")

    # renderPost deps — append styles, c if not present
    text = text.replace(
        "    [canComment, detail?.channel, channelId, navigation, openPostInteractionMenu, renderPostContent, setPostContentRef]",
        "    [canComment, detail?.channel, channelId, navigation, openPostInteractionMenu, renderPostContent, setPostContentRef, styles, c]",
        1,
    )

    PATH.write_text(text, encoding="utf-8")
    print("patched", PATH)


if __name__ == "__main__":
    main()
