import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import {
  resolveChannelByInvite,
  resolveChannelBySlug,
  type ChannelResolveResult,
} from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { resolveAvatarUrl } from '../config';
import { colors } from '../theme/colors';
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
};

export function ChannelLinkRichMessage({
  parsed,
  rawUrlLine,
  isMe,
  time,
  status,
  navigation,
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

  const accent = isMe ? '#3D6E1F' : '#6B7C3A';
  const border = isMe ? 'rgba(61,110,31,0.35)' : 'rgba(107,124,58,0.45)';

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
        isMe ? styles.bubbleMe : styles.bubbleOther,
        isMe ? styles.bubbleAlignMe : styles.bubbleAlignOther,
      ]}
    >
      <Pressable onPress={openChannel}>
        <Text style={[styles.urlLine, { color: accent }]} numberOfLines={2}>
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
              <Text style={styles.previewTitle} numberOfLines={2}>
                {title}
              </Text>
              <Text style={styles.previewDesc} numberOfLines={3}>
                {description}
              </Text>
            </View>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.previewThumb} />
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
            { borderTopColor: border },
            pressed && styles.ctaPressed,
          ]}
        >
          <Text style={[styles.ctaText, { color: accent }]} numberOfLines={1}>
            ПЕРЕЙТИ В КАНАЛ
          </Text>
        </Pressable>
      </View>

      <View style={styles.timeRow}>
        <MessageTimeStatus time={time} status={status} isMe={isMe} compact />
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
  bubbleMe: {
    backgroundColor: '#E8F7C9',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(61,110,31,0.25)',
  },
  bubbleOther: {
    backgroundColor: '#F5F6D6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(107,124,58,0.28)',
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
    color: '#111827',
  },
  previewDesc: {
    marginTop: 4,
    fontSize: 15,
    color: '#1F2937',
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
