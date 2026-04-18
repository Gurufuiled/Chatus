import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import { fetchChannelDetail, updateChannel } from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { colors } from '../theme/colors';
import { buildChannelInviteDeepLink, buildChannelSlugDeepLink } from '../config';
import { ShareLinkToChatSheet } from '../components/ShareLinkToChatSheet';

type Route = RouteProp<ChatsStackParamList, 'ChannelType'>;
type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChannelType'>;

const SLUG_REGEX = /^[a-z0-9_]*$/;
const SLUG_PREFIX = 'chatus://c/';

export function ChannelTypeScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { channelId } = route.params;
  const detail = channelStore((state) => state.detailsById[channelId]);
  const channel = detail?.channel;
  const canEdit = detail?.channel_permissions?.can_edit_channel === true;

  const [visibility, setVisibility] = React.useState<'public' | 'private'>(
    channel?.visibility === 'private' ? 'private' : 'public',
  );
  const [slug, setSlug] = React.useState(channel?.slug ?? '');
  const [saving, setSaving] = React.useState(false);
  const [slugError, setSlugError] = React.useState<string | null>(null);
  const [shareSheetOpen, setShareSheetOpen] = React.useState(false);

  React.useEffect(() => {
    if (channel) {
      setVisibility(channel.visibility === 'private' ? 'private' : 'public');
      setSlug(channel.slug ?? '');
    }
  }, [channel?.visibility, channel?.slug]);

  React.useEffect(() => {
    if (!detail) {
      void fetchChannelDetail(channelId).then((next) => {
        channelStore.getState().setDetail(channelId, next);
        chatStore.getState().addOrUpdateChat(next.channel);
      });
    }
  }, [channelId, detail]);

  const handleSlugChange = React.useCallback((text: string) => {
    const lower = text.toLowerCase();
    if (!SLUG_REGEX.test(lower)) return;
    setSlug(lower);
    if (lower.length > 0 && lower.length < 5) {
      setSlugError('Минимальная длина — 5 символов');
    } else {
      setSlugError(null);
    }
  }, []);

  const clearSlug = React.useCallback(() => {
    setSlug('');
    setSlugError(null);
  }, []);

  const inviteLink = channel?.invite_token
    ? buildChannelInviteDeepLink(channel.invite_token)
    : '';

  const handleSave = React.useCallback(async () => {
    if (visibility === 'public' && slug.length > 0 && slug.length < 5) {
      setSlugError('Минимальная длина — 5 символов');
      return;
    }

    setSaving(true);
    try {
      const payload: {
        visibility: 'public' | 'private';
        slug?: string;
        clear_slug?: boolean;
      } = { visibility };

      if (visibility === 'public') {
        if (slug.trim().length >= 5) {
          payload.slug = slug.trim();
        } else {
          payload.clear_slug = true;
        }
      }

      const updated = await updateChannel(channelId, payload);
      channelStore.getState().upsertChannel(updated);
      chatStore.getState().addOrUpdateChat(updated);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  }, [channelId, navigation, slug, visibility]);

  const isPublic = visibility === 'public';

  const handleCopyInvite = React.useCallback(() => {
    if (!inviteLink) return;
    void Clipboard.setStringAsync(inviteLink);
    Alert.alert('Скопировано', inviteLink);
  }, [inviteLink]);

  const handleShareInvite = React.useCallback(() => {
    if (!inviteLink) return;
    void Share.share({ message: inviteLink });
  }, [inviteLink]);

  return (
    <View style={styles.screen}>
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
        >
          <Text style={styles.headerBtnText}>Отмена</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Тип канала</Text>
        <Pressable
          onPress={() => void handleSave()}
          disabled={saving || !canEdit}
          style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={[styles.headerBtnText, styles.headerBtnDone]}>Готово</Text>
          )}
        </Pressable>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>ССЫЛКА</Text>
        <View style={styles.sectionCard}>
          <Pressable
            onPress={() => canEdit && setVisibility('public')}
            disabled={!canEdit}
            style={({ pressed }) => [styles.radioRow, pressed && styles.radioRowPressed]}
          >
            {isPublic ? (
              <Feather name="check" size={20} color={colors.accent} />
            ) : (
              <View style={styles.radioEmpty} />
            )}
            <Text style={styles.radioLabel}>Публичная</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            onPress={() => canEdit && setVisibility('private')}
            disabled={!canEdit}
            style={({ pressed }) => [styles.radioRow, pressed && styles.radioRowPressed]}
          >
            {!isPublic ? (
              <Feather name="check" size={20} color={colors.accent} />
            ) : (
              <View style={styles.radioEmpty} />
            )}
            <Text style={styles.radioLabel}>Частная</Text>
          </Pressable>
        </View>

        <Text style={styles.hint}>
          {isPublic
            ? 'Публичные каналы можно найти через поиск, подписаться на них может любой пользователь.'
            : 'На частные каналы можно подписаться только по ссылке-приглашению.'}
        </Text>

        {isPublic ? (
          <>
            <View style={styles.slugCard}>
              <Text style={styles.slugPrefix}>{SLUG_PREFIX}</Text>
              <TextInput
                style={styles.slugInput}
                value={slug}
                onChangeText={handleSlugChange}
                placeholder="your_channel"
                placeholderTextColor="#B0B0B0"
                autoCapitalize="none"
                autoCorrect={false}
                editable={canEdit}
              />
              {slug.length > 0 ? (
                <Pressable
                  onPress={clearSlug}
                  style={({ pressed }) => [styles.slugClear, pressed && { opacity: 0.6 }]}
                >
                  <View style={styles.slugClearCircle}>
                    <Feather name="x" size={14} color="#FFFFFF" />
                  </View>
                </Pressable>
              ) : null}
            </View>

            {slugError ? (
              <Text style={styles.slugErrorText}>{slugError}</Text>
            ) : (
              <Text style={styles.hint}>
                Если у канала будет постоянная публичная ссылка, другие пользователи смогут найти его
                и подписаться.
              </Text>
            )}

            <Text style={styles.hintSmall}>
              Можно использовать латиницу (a-z), цифры (0-9) и подчёркивание. Минимальная длина — 5
              символов. Публичная ссылка: {slug.trim().length >= 5 ? buildChannelSlugDeepLink(slug.trim()) : '—'}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>ССЫЛКА-ПРИГЛАШЕНИЕ</Text>
            <View style={styles.sectionCard}>
              <View style={styles.invitePill}>
                <Text style={styles.invitePillText} selectable numberOfLines={1}>
                  {inviteLink || 'Ссылка недоступна'}
                </Text>
              </View>
              <Pressable
                onPress={() => void handleShareInvite()}
                disabled={!inviteLink}
                style={({ pressed }) => [styles.shareFullBtn, pressed && styles.rowPressed]}
              >
                <Text style={styles.shareFullBtnText}>Поделиться</Text>
              </Pressable>
              <View style={styles.inviteActions}>
                <Pressable
                  onPress={() => void handleCopyInvite()}
                  style={({ pressed }) => [styles.secondaryBtn, pressed && styles.rowPressed]}
                >
                  <Text style={styles.secondaryBtnText}>Копировать</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShareSheetOpen(true)}
                  style={({ pressed }) => [styles.secondaryBtn, pressed && styles.rowPressed]}
                >
                  <Text style={styles.secondaryBtnText}>Контакты…</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.hint}>
              По этой ссылке можно подписаться на канал. Отправьте её через «Поделиться» или выберите
              чат в «Контакты».
            </Text>
          </>
        )}

      </ScrollView>

      <ShareLinkToChatSheet
        visible={shareSheetOpen}
        linkText={inviteLink}
        onClose={() => setShareSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F0F0F5' },
  container: { flex: 1 },
  content: { paddingBottom: 40 },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F7F7F8',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D1D5DB',
  },
  headerBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  headerBtnPressed: { opacity: 0.6 },
  headerBtnText: { fontSize: 17, color: colors.accent },
  headerBtnDone: { fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },

  sectionLabel: {
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 32,
    fontSize: 13,
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: 'hidden',
  },

  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  radioRowPressed: { backgroundColor: '#F5F6F8' },
  rowPressed: { opacity: 0.85 },
  radioEmpty: { width: 20 },
  radioLabel: { fontSize: 17, color: '#111827' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E3E4E8',
    marginLeft: 48,
  },

  hint: {
    marginTop: 8,
    marginHorizontal: 32,
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 19,
  },
  hintSmall: {
    marginTop: 6,
    marginHorizontal: 32,
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
  },

  slugCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  slugPrefix: { fontSize: 16, color: '#6B7280' },
  slugInput: {
    flex: 1,
    fontSize: 17,
    color: '#111827',
    padding: 0,
  },
  slugClear: { marginLeft: 8 },
  slugClearCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slugErrorText: {
    marginTop: 6,
    marginHorizontal: 32,
    fontSize: 14,
    color: '#EF4444',
  },

  invitePill: {
    marginHorizontal: 14,
    marginTop: 14,
    backgroundColor: '#ECECEE',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  invitePillText: { fontSize: 16, color: '#111827' },
  shareFullBtn: {
    marginHorizontal: 14,
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shareFullBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  inviteActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.accent, fontWeight: '600', fontSize: 15 },

});
