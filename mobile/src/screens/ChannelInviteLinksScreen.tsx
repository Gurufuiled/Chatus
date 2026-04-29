import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import { fetchChannelDetail } from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { buildChannelInviteDeepLink } from '../config';
import { ShareLinkToChatSheet } from '../components/ShareLinkToChatSheet';

type Route = RouteProp<ChatsStackParamList, 'ChannelInviteLinks'>;
type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChannelInviteLinks'>;

export function ChannelInviteLinksScreen() {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createChannelInviteLinksStyles(c), [c]);
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { channelId } = route.params;
  const detail = channelStore((s) => s.detailsById[channelId]);
  const channel = detail?.channel;
  const [loading, setLoading] = React.useState(!detail);
  const [shareSheet, setShareSheet] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const next = await fetchChannelDetail(channelId);
        channelStore.getState().setDetail(channelId, next);
        chatStore.getState().addOrUpdateChat(next.channel);
      } catch (e) {
        Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось загрузить');
      } finally {
        setLoading(false);
      }
    })();
  }, [channelId]);

  const inviteToken = channel?.invite_token?.trim();
  const linkText = inviteToken ? buildChannelInviteDeepLink(inviteToken) : '';

  const handleCopy = React.useCallback(() => {
    if (!linkText) return;
    void Clipboard.setStringAsync(linkText);
    Alert.alert('Скопировано', linkText);
  }, [linkText]);

  const handleShare = React.useCallback(() => {
    if (!linkText) return;
    void Share.share({ message: linkText });
  }, [linkText]);

  if (loading && !channel) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={c.accent} />
      </View>
    );
  }

  if (!channel) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Канал недоступен</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.headerCircle, pressed && styles.pressed]}
        >
          <Feather name="chevron-left" size={22} color={c.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Пригласительные ссылки</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Любой пользователь сможет подписаться на канал при помощи этой ссылки.
        </Text>

        <Text style={styles.sectionLabel}>ССЫЛКА-ПРИГЛАШЕНИЕ</Text>
        <View style={styles.card}>
          <View style={styles.linkPill}>
            <Text style={styles.linkText} selectable numberOfLines={1}>
              {linkText || 'Ссылка недоступна'}
            </Text>
            <Pressable
              onPress={() =>
                Alert.alert('Ссылка', linkText || 'Недоступно', [
                  { text: 'OK' },
                  ...(linkText ? [{ text: 'Копировать', onPress: () => void handleCopy() }] : []),
                ])
              }
              style={({ pressed }) => [styles.moreBtn, pressed && styles.pressed]}
            >
              <Feather name="more-horizontal" size={18} color={c.iconMuted} />
            </Pressable>
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => void handleCopy()}
              disabled={!linkText}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed, !linkText && styles.disabled]}
            >
              <Text style={styles.actionBtnText}>Копировать</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleShare()}
              disabled={!linkText}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed, !linkText && styles.disabled]}
            >
              <Text style={styles.actionBtnText}>Поделиться</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => setShareSheet(true)}
            disabled={!linkText}
            style={({ pressed }) => [styles.fullShare, pressed && styles.pressed, !linkText && styles.disabled]}
          >
            <Text style={styles.fullShareText}>Отправить контакту…</Text>
          </Pressable>

          <Text style={styles.stats}>никто пока не присоединился</Text>
        </View>

        <Text style={styles.footerHint}>
          По этой ссылке можно подписаться на канал. Вы можете сбросить её в любой момент (скоро).
        </Text>
      </ScrollView>

      <ShareLinkToChatSheet
        visible={shareSheet}
        linkText={linkText}
        onClose={() => setShareSheet(false)}
      />
    </View>
  );
}

function createChannelInviteLinksStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.chatBackground },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.chatBackground },
    muted: { color: c.textSecondary, fontSize: 16 },
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingVertical: 10,
      backgroundColor: c.header,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    headerCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.inputBackgroundSolid,
    },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: c.textPrimary },
    headerSpacer: { width: 40 },
    content: { padding: 16, paddingBottom: 40 },
    intro: {
      fontSize: 15,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: 20,
    },
    sectionLabel: {
      marginLeft: 8,
      marginBottom: 8,
      fontSize: 13,
      color: c.textSecondary,
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: c.inputBackgroundSolid,
      borderRadius: 14,
      padding: 14,
    },
    linkPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBackground,
      borderRadius: 999,
      paddingLeft: 14,
      paddingVertical: 10,
      gap: 8,
    },
    linkText: { flex: 1, fontSize: 15, color: c.textPrimary },
    moreBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.buttonBackground,
      marginRight: 4,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
    },
    actionBtn: {
      flex: 1,
      backgroundColor: c.accent,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    actionBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
    fullShare: {
      marginTop: 10,
      alignItems: 'center',
      paddingVertical: 10,
    },
    fullShareText: { color: c.accent, fontWeight: '600', fontSize: 16 },
    stats: {
      marginTop: 12,
      textAlign: 'center',
      fontSize: 14,
      color: c.textSecondary,
    },
    footerHint: {
      marginTop: 16,
      marginHorizontal: 8,
      fontSize: 14,
      color: c.textSecondary,
      lineHeight: 19,
    },
    pressed: { opacity: 0.75 },
    disabled: { opacity: 0.45 },
  });
}

