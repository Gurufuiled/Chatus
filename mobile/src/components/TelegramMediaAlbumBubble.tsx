import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { MessageTimeStatus } from './MessageTimeStatus';
import {
  MeBubbleChrome,
} from './OutgoingBubbleViewportGradient';
import type { ChatTheme } from '../theme/chatThemes';
import type { TelegramAlbumMediaItem } from '../screens/telegramChat/types';
import type { TelegramChatStyles } from '../screens/telegramChat/telegramChatStyles';
import { formatMediaDuration } from '../utils/mediaDuration';

const SCREEN_WIDTH = Dimensions.get('window').width;
const ALBUM_BUBBLE_WIDTH = Math.min(SCREEN_WIDTH * 0.72, 280);

export type TelegramMediaAlbumBubbleProps = {
  items: TelegramAlbumMediaItem[];
  isMe: boolean;
  caption?: string;
  time: string;
  status: string;
  styles: TelegramChatStyles;
  chatTheme: ChatTheme;
  viewportOutgoingGradient: boolean;
  scrollTick: number;
  incomingCaptionBg?: string;
  incomingCaptionBorder?: string;
  incomingCaptionText?: string;
  incomingCaptionMeta?: string;
  footer?: React.ReactNode;
};

function tileUri(item: TelegramAlbumMediaItem): string {
  if (item.kind === 'image') return item.mediaUri?.trim() ?? '';
  return item.thumbnailUri?.trim() || item.mediaUri?.trim() || '';
}

export function TelegramMediaAlbumBubble({
  items,
  isMe,
  caption,
  time,
  status,
  styles: st,
  chatTheme,
  viewportOutgoingGradient,
  scrollTick,
  incomingCaptionBg,
  incomingCaptionBorder,
  incomingCaptionText,
  incomingCaptionMeta,
  footer,
}: TelegramMediaAlbumBubbleProps) {
  const media = useMemo(
    () => items.filter((item) => tileUri(item).length > 0).slice(0, 10),
    [items],
  );
  if (media.length === 0) return null;

  const visibleMedia = media.slice(0, 9);
  const albumWidth = ALBUM_BUBBLE_WIDTH;
  const gap = 1.5;
  const trimmedCaption = caption?.trim();

  const renderTile = (item: TelegramAlbumMediaItem, index: number, style: object) => {
    const uri = tileUri(item);
    const extraCount = media.length - visibleMedia.length;
    const showExtra = index === visibleMedia.length - 1 && extraCount > 0;
    return (
      <View key={`${item.messageId}-${index}`} style={[st.albumTile, style]}>
        <Image source={{ uri }} style={st.albumImage} contentFit="cover" />
        {item.kind === 'video' ? (
          <View style={st.albumVideoBadge}>
            <Feather name="play" size={10} color="#FFFFFF" />
            <Text style={st.albumVideoDuration}>
              {formatMediaDuration(item.durationMs ?? 0)}
            </Text>
          </View>
        ) : null}
        {showExtra ? (
          <View style={st.albumExtraOverlay}>
            <Text style={st.albumExtraText}>+{extraCount}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  const grid = (() => {
    if (visibleMedia.length === 1) {
      return renderTile(visibleMedia[0]!, 0, { width: albumWidth, height: albumWidth });
    }
    if (visibleMedia.length === 2) {
      const tileWidth = (albumWidth - gap) / 2;
      return (
        <View style={st.albumRow}>
          {visibleMedia.map((item, index) =>
            renderTile(item, index, { width: tileWidth, height: albumWidth }),
          )}
        </View>
      );
    }
    if (visibleMedia.length === 3) {
      const sideWidth = (albumWidth - gap) * 0.58;
      const rightWidth = albumWidth - sideWidth - gap;
      const halfHeight = (albumWidth - gap) / 2;
      return (
        <View style={st.albumRow}>
          {renderTile(visibleMedia[0]!, 0, { width: sideWidth, height: albumWidth })}
          <View style={[st.albumColumn, { width: rightWidth }]}>
            {renderTile(visibleMedia[1]!, 1, { width: rightWidth, height: halfHeight })}
            {renderTile(visibleMedia[2]!, 2, { width: rightWidth, height: halfHeight })}
          </View>
        </View>
      );
    }
    if (visibleMedia.length === 4) {
      const tileW = (albumWidth - gap) / 2;
      const tileH = (albumWidth - gap) / 2;
      return (
        <View style={[st.albumColumn, { width: albumWidth }]}>
          <View style={st.albumRow}>
            {renderTile(visibleMedia[0]!, 0, { width: tileW, height: tileH })}
            {renderTile(visibleMedia[1]!, 1, { width: tileW, height: tileH })}
          </View>
          <View style={st.albumRow}>
            {renderTile(visibleMedia[2]!, 2, { width: tileW, height: tileH })}
            {renderTile(visibleMedia[3]!, 3, { width: tileW, height: tileH })}
          </View>
        </View>
      );
    }
    const columns = 3;
    const tileWidth = (albumWidth - gap * (columns - 1)) / columns;
    return (
      <View style={st.albumGrid}>
        {visibleMedia.map((item, index) =>
          renderTile(item, index, { width: tileWidth, height: tileWidth }),
        )}
      </View>
    );
  })();

  const albumShell = (
    <>
      <View style={[st.albumGridClip, { width: albumWidth }]}>
        {grid}
        {!trimmedCaption ? (
          <View style={st.albumTimeOverlay}>
            <MessageTimeStatus
              time={time}
              status={status}
              isMe={isMe}
              compact
              timeColor="#FFFFFF"
              iconColor="#FFFFFF"
            />
          </View>
        ) : null}
      </View>
      {trimmedCaption ? (
        <View
          style={[
            st.albumCaptionWrap,
            isMe
              ? viewportOutgoingGradient
                ? [st.albumCaptionMe, { backgroundColor: 'transparent' }]
                : [st.albumCaptionMe, { backgroundColor: chatTheme.bubbleMe }]
              : [
                  st.albumCaptionOther,
                  incomingCaptionBg
                    ? {
                        backgroundColor: incomingCaptionBg,
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: incomingCaptionBorder ?? 'transparent',
                      }
                    : null,
                ],
          ]}
        >
          <Text
            style={[
              st.albumCaptionText,
              isMe ? { color: chatTheme.bubbleMeText } : null,
              !isMe && incomingCaptionText ? { color: incomingCaptionText } : null,
            ]}
          >
            {trimmedCaption}
          </Text>
          <MessageTimeStatus
            time={time}
            status={status}
            isMe={isMe}
            compact
            timeColor={isMe ? chatTheme.bubbleMeMeta : incomingCaptionMeta}
            iconColor={isMe ? chatTheme.bubbleMeMeta : incomingCaptionMeta}
          />
        </View>
      ) : null}
      {footer}
    </>
  );

  if (isMe && viewportOutgoingGradient) {
    return (
      <MeBubbleChrome
        active
        scrollTick={scrollTick}
        fillColor={chatTheme.bubbleMe}
        style={[st.albumBubble, st.albumBubbleMe]}
      >
        {albumShell}
      </MeBubbleChrome>
    );
  }

  return (
    <View style={[st.albumBubble, isMe ? st.albumBubbleMe : st.albumBubbleOther]}>
      {albumShell}
    </View>
  );
}
