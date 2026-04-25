import React from 'react';
import {
  ActivityIndicator,
  Image as RNImage,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import {
  resolveChannelByInvite,
  resolveChannelBySlug,
  type ChannelResolveResult,
} from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { resolveAvatarUrl } from '../config';
import { colors, withAlpha } from '../theme/colors';
import type { ChatTheme } from '../theme/chatThemes';
import type { ParsedChannelDeepLink } from '../utils/channelDeepLink';
import { MessageTimeStatus } from './MessageTimeStatus';

type Nav = NativeStackNavigationProp<ChatsStackParamList>;

type Props = {
  parsed: ParsedChannelDeepLink;
  rawUrlLine: string;
  isMe: boolean;
  time: string;
  status: string;
  navigation: Nav;
  chatTheme: ChatTheme;
};

export function ChannelLinkRichMessage({
  parsed,
  rawUrlLine,
  isMe,
  time,
  status,
  navigation,
  chatTheme,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const bubbleLayout = React.useMemo(() => {
    const maxW = Math.min(windowWidth * 0.82, 340);
    const minW = Math.min(windowWidth * 0.68, 300);
    return { maxWidth: maxW, minWidth: minW };
  }, [windowWidth]);

  const [resolved, setResolved] = React.useState<ChannelResolveResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const result =
          parsed.kind === 'slug'
            ? await resolveChannelBySlug(parsed.slug)
            : await resolveChannelByInvite(parsed.inviteToken);
        if (!cancelled) {
          setResolved(result);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Не удалось загрузить');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parsed]);

  const openChannel = React.useCallback(() => {
    if (resolved) {
      channelStore.getState().setLinkResolve(resolved.channel_id, resolved);
      navigation.navigate('ChannelFeed', {
        channelId: resolved.channel_id,
        inviteToken: parsed.kind === 'invite' ? parsed.inviteToken : undefined,
      });
      return;
    }
    if (parsed.kind === 'slug') {
      navigation.navigate('ChannelLinkSlug', { slug: parsed.slug });
    } else {
      navigation.navigate('ChannelLinkInvite', { inviteToken: parsed.inviteToken });
    }
  }, [navigation, parsed, resolved]);

  const accent = isMe ? chatTheme.bubbleMeAccent : colors.accent;
  const bubbleBorder = isMe
    ? withAlpha(chatTheme.bubbleMeAccent, 0.32)
    : colors.bubbleOtherBorder;
  const bubbleBg = isMe ? chatTheme.bubbleMe : colors.bubbleOther;
  const urlColor = isMe ? chatTheme.bubbleMeText : colors.link;
  const titleColor = isMe ? chatTheme.bubbleMeText : colors.textPrimary;
  const descColor = isMe ? chatTheme.bubbleMeMeta : '#4B5563';
  const ctaDivider = isMe ? withAlpha(chatTheme.bubbleMeAccent, 0.38) : 'rgba(148,163,184,0.55)';

  const title =
    resolved?.channel.name?.trim() ||
    (parsed.kind === 'slug' ? parsed.slug : 'Канал');
  const description = resolved?.channel.description?.trim() || ' ';
  const avatarUri = resolveAvatarUrl(resolved?.channel.avatar_url ?? null);

  return (
    <View
      style={[
        styles.bubble,
        bubbleLayout,
        isMe ? styles.bubbleAlignMe : styles.bubbleAlignOther,
        {
          backgroundColor: bubbleBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: bubbleBorder,
        },
      ]}
    >
      <Pressable onPress={openChannel}>
        <Text style={[styles.urlLine, { color: urlColor }]} numberOfLines={2}>
          {rawUrlLine}
        </Text>
      </Pressable>

      <View style={[styles.previewBlock, { borderLeftColor: accent }]}>
        {loading ? (
          <View style={styles.previewLoading}>
            <ActivityIndicator size="small" color={accent} />
          </View>
        ) : error ? (
          <Text style={styles.previewError}>{error}</Text>
        ) : (
          <View style={styles.previewRow}>
            <View style={styles.previewTextCol}>
              <Text style={[styles.previewSource, { color: accent }]}>Messenger</Text>
              <Text style={[styles.previewTitle, { color: titleColor }]} numberOfLines={2}>
                {title}
              </Text>
              <Text style={[styles.previewDesc, { color: descColor }]} numberOfLines={3}>
                {description}
              </Text>
            </View>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.previewThumb} contentFit="cover" cachePolicy="disk" />
            ) : (
              <View style={[styles.previewThumb, styles.previewThumbPlaceholder]}>
                <Text style={styles.previewThumbLetter}>
                  {(title[0] || '?').toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        )}

        <Pressable
          onPress={openChannel}
          style={({ pressed }) => [
            styles.ctaRow,
            { borderTopColor: ctaDivider },
            pressed && styles.ctaPressed,
          ]}
        >
          <Text style={[styles.ctaText, { color: accent }]} numberOfLines={1}>
            ПЕРЕЙТИ В КАНАЛ
          </Text>
        </Pressable>
      </View>

      <View style={styles.timeRow}>
        <MessageTimeStatus
          time={time}
          status={status}
          isMe={isMe}
          compact
          timeColor={isMe ? chatTheme.bubbleMeMeta : undefined}
          iconColor={isMe ? chatTheme.bubbleMeMeta : undefined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
  },
  bubbleAlignMe: {
    alignSelf: 'flex-end',
  },
  bubbleAlignOther: {
    alignSelf: 'flex-start',
  },
  urlLine: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  previewBlock: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingBottom: 0,
  },
  previewLoading: {
    minHeight: 56,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  previewError: {
    fontSize: 14,
    color: '#B45309',
    paddingVertical: 6,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  previewTextCol: {
    flex: 1,
    minWidth: 0,
  },
  previewSource: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  previewDesc: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 20,
  },
  previewThumb: {
    width: 52,
    height: 52,
    borderRadius: 6,
  },
  previewThumbPlaceholder: {
    backgroundColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewThumbLetter: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ctaRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  ctaPressed: { opacity: 0.7 },
  ctaText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  timeRow: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
});
