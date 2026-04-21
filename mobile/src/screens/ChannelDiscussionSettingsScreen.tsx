import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import type { ChatsStackParamList } from '../navigation/types';
import { fetchChannelDetail, updateChannel } from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { colors, withAlpha } from '../theme/colors';

type Route = RouteProp<ChatsStackParamList, 'ChannelDiscussionSettings'>;

/* ─── Toggle Row ─── */

function ToggleRow({
  icon,
  iconColor,
  label,
  sublabel,
  value,
  onValueChange,
  disabled,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  iconColor: string;
  label: string;
  sublabel?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, disabled && styles.toggleRowDisabled]}>
      <View style={[styles.toggleIcon, { backgroundColor: withAlpha(iconColor, 0.14) }]}>
        <Feather name={icon} size={17} color={iconColor} />
      </View>
      <View style={styles.toggleBody}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {sublabel ? <Text style={styles.toggleSublabel}>{sublabel}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#E5E7EB', true: withAlpha(colors.accent, 0.55) }}
        thumbColor={value ? colors.accent : '#FAFAFA'}
        ios_backgroundColor="#E5E7EB"
      />
    </View>
  );
}

/* ─── Screen ─── */

export function ChannelDiscussionSettingsScreen() {
  const route = useRoute<Route>();
  const { channelId } = route.params;
  const detail = channelStore((state) => state.detailsById[channelId]);
  const channel = detail?.channel;
  const canEdit = detail?.channel_permissions?.can_edit_channel === true;

  const [disableNew, setDisableNew] = React.useState(channel?.disable_comments_new === 1);
  const [disableAll, setDisableAll] = React.useState(channel?.disable_comments_all === 1);
  const [disableVoice, setDisableVoice] = React.useState(channel?.disable_voice_comments === 1);
  const [disableMedia, setDisableMedia] = React.useState(channel?.disable_media_comments === 1);
  const [cooldown, setCooldown] = React.useState(channel?.comment_cooldown_sec ?? 0);
  const [snackbar, setSnackbar] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (channel) {
      setDisableNew(channel.disable_comments_new === 1);
      setDisableAll(channel.disable_comments_all === 1);
      setDisableVoice(channel.disable_voice_comments === 1);
      setDisableMedia(channel.disable_media_comments === 1);
      setCooldown(channel.comment_cooldown_sec ?? 0);
    }
  }, [
    channel?.disable_comments_new,
    channel?.disable_comments_all,
    channel?.disable_voice_comments,
    channel?.disable_media_comments,
    channel?.comment_cooldown_sec,
  ]);

  React.useEffect(() => {
    if (!detail) {
      void fetchChannelDetail(channelId).then((next) => {
        channelStore.getState().setDetail(channelId, next);
        chatStore.getState().addOrUpdateChat(next.channel);
      });
    }
  }, [channelId, detail]);

  React.useEffect(() => {
    if (!snackbar) return;
    const timer = setTimeout(() => setSnackbar(null), 1800);
    return () => clearTimeout(timer);
  }, [snackbar]);

  /* Auto-save helper */
  const saveField = React.useCallback(
    async (payload: Record<string, boolean | number>) => {
      if (!canEdit) {
        setSnackbar('Недостаточно прав');
        return false;
      }
      try {
        const updated = await updateChannel(channelId, payload);
        channelStore.getState().upsertChannel(updated);
        chatStore.getState().addOrUpdateChat(updated);
        return true;
      } catch (error) {
        Alert.alert('Ошибка', error instanceof Error ? error.message : 'Попробуйте ещё раз.');
        return false;
      }
    },
    [canEdit, channelId],
  );

  const handleDisableNew = React.useCallback(
    async (v: boolean) => {
      setDisableNew(v);
      const ok = await saveField({ disable_comments_new: v });
      if (!ok) setDisableNew(!v);
    },
    [saveField],
  );

  const handleDisableAll = React.useCallback(
    async (v: boolean) => {
      setDisableAll(v);
      if (v) setDisableNew(true);
      const ok = await saveField({
        disable_comments_all: v,
        ...(v ? { disable_comments_new: true } : {}),
      });
      if (!ok) {
        setDisableAll(!v);
        if (v) setDisableNew(channel?.disable_comments_new === 1);
      }
    },
    [channel?.disable_comments_new, saveField],
  );

  const handleDisableVoice = React.useCallback(
    async (v: boolean) => {
      setDisableVoice(v);
      const ok = await saveField({ disable_voice_comments: v });
      if (!ok) setDisableVoice(!v);
    },
    [saveField],
  );

  const handleDisableMedia = React.useCallback(
    async (v: boolean) => {
      setDisableMedia(v);
      const ok = await saveField({ disable_media_comments: v });
      if (!ok) setDisableMedia(!v);
    },
    [saveField],
  );

  /* Cooldown stepper */
  const handleCooldownChange = React.useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(15, cooldown + delta));
      if (next === cooldown) return;
      setCooldown(next);
      void saveField({ comment_cooldown_sec: next });
    },
    [cooldown, saveField],
  );

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* ─── Comments toggles ─── */}
        <Text style={styles.sectionLabel}>КОММЕНТАРИИ</Text>
        <View style={styles.sectionCard}>
          <ToggleRow
            icon="message-square"
            iconColor={colors.accent}
            label="Откл. к новым постам"
            sublabel="Новые посты публикуются без комментариев"
            value={disableNew}
            onValueChange={(v) => void handleDisableNew(v)}
            disabled={!canEdit || disableAll}
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="slash"
            iconColor="#EF4444"
            label="Откл. для всех постов"
            sublabel="Комментарии полностью отключены"
            value={disableAll}
            onValueChange={(v) => void handleDisableAll(v)}
            disabled={!canEdit}
          />
        </View>

        {disableAll ? (
          <View style={styles.noticeCard}>
            <Feather name="info" size={15} color="#B45309" />
            <Text style={styles.noticeText}>
              Комментарии отключены для всех постов. Это перекрывает настройку «только для новых».
            </Text>
          </View>
        ) : null}

        {/* ─── Content restrictions ─── */}
        <Text style={styles.sectionLabel}>ОГРАНИЧЕНИЯ КОНТЕНТА</Text>
        <View style={styles.sectionCard}>
          <ToggleRow
            icon="mic-off"
            iconColor="#8A6DF1"
            label="Запретить голосовые"
            sublabel="Пользователи не смогут отправлять голосовые сообщения"
            value={disableVoice}
            onValueChange={(v) => void handleDisableVoice(v)}
            disabled={!canEdit}
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="image"
            iconColor="#F59E0B"
            label="Запретить медиа"
            sublabel="Фото и видео в комментариях запрещены"
            value={disableMedia}
            onValueChange={(v) => void handleDisableMedia(v)}
            disabled={!canEdit}
          />
        </View>

        {/* ─── Cooldown stepper ─── */}
        <Text style={styles.sectionLabel}>АНТИФЛУД</Text>
        <View style={styles.sectionCard}>
          <View style={styles.stepperRow}>
            <View style={[styles.toggleIcon, { backgroundColor: withAlpha('#10B981', 0.14) }]}>
              <Feather name="clock" size={17} color="#10B981" />
            </View>
            <View style={styles.stepperBody}>
              <Text style={styles.stepperLabel}>Таймер между сообщениями</Text>
              <Text style={styles.stepperSublabel}>
                Мин. интервал в обсуждении
              </Text>
            </View>
          </View>
          <View style={styles.stepperControls}>
            <Pressable
              onPress={() => handleCooldownChange(-1)}
              disabled={!canEdit || cooldown <= 0}
              style={({ pressed }) => [
                styles.stepperBtn,
                pressed && styles.stepperBtnPressed,
                (!canEdit || cooldown <= 0) && styles.stepperBtnDisabled,
              ]}
            >
              <Feather name="minus" size={18} color={colors.accent} />
            </Pressable>
            <View style={styles.stepperValueWrap}>
              <Text
                style={[
                  styles.stepperValue,
                  cooldown === 0 && styles.stepperValueOff,
                ]}
              >
                {cooldown === 0 ? 'Выкл' : `${cooldown} сек`}
              </Text>
            </View>
            <Pressable
              onPress={() => handleCooldownChange(1)}
              disabled={!canEdit || cooldown >= 15}
              style={({ pressed }) => [
                styles.stepperBtn,
                pressed && styles.stepperBtnPressed,
                (!canEdit || cooldown >= 15) && styles.stepperBtnDisabled,
              ]}
            >
              <Feather name="plus" size={18} color={colors.accent} />
            </Pressable>
          </View>
          <View style={styles.trackWrap}>
            <View style={styles.trackBg} />
            <View
              style={[
                styles.trackFill,
                { width: `${(cooldown / 15) * 100}%` },
              ]}
            />
          </View>
        </View>

        <Text style={styles.hint}>
          Минимальный интервал от 1 до 15 секунд между сообщениями одного пользователя (антифлуд).
          Установите 0 для отключения.
        </Text>
      </ScrollView>

      {snackbar ? (
        <View style={styles.snackbarWrap} pointerEvents="none">
          <Text style={styles.snackbarText}>{snackbar}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F2F4F8' },
  container: { flex: 1 },
  content: { paddingBottom: 40 },

  /* Section */
  sectionLabel: {
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 32,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.7,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },

  /* Toggle row */
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  toggleIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRowDisabled: { opacity: 0.5 },
  toggleBody: { flex: 1 },
  toggleLabel: { fontSize: 15.5, color: colors.textPrimary, fontWeight: '600', lineHeight: 20 },
  toggleSublabel: { marginTop: 2, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginLeft: 64,
  },

  /* Notice */
  noticeCard: {
    marginTop: 8,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FCD34D',
  },
  noticeText: {
    flex: 1,
    color: '#92400E',
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '500',
  },

  /* Stepper */
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 4,
    gap: 12,
  },
  stepperBody: { flex: 1 },
  stepperLabel: { fontSize: 15.5, color: colors.textPrimary, fontWeight: '600', lineHeight: 20 },
  stepperSublabel: { marginTop: 2, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 10,
    gap: 16,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: withAlpha(colors.accent, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnPressed: { backgroundColor: withAlpha(colors.accent, 0.18) },
  stepperBtnDisabled: { opacity: 0.35 },
  stepperValueWrap: {
    minWidth: 88,
    alignItems: 'center',
  },
  stepperValue: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  stepperValueOff: { color: colors.textSecondary, fontWeight: '600' },
  trackWrap: {
    height: 4,
    marginHorizontal: 20,
    marginBottom: 16,
    justifyContent: 'center',
  },
  trackBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.inputBackground,
    borderRadius: 2,
  },
  trackFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },

  /* Hint */
  hint: {
    marginTop: 8,
    marginHorizontal: 32,
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 19,
  },

  /* Snackbar */
  snackbarWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 14,
    backgroundColor: 'rgba(239,246,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.35)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  snackbarText: { color: '#1E40AF', textAlign: 'center', fontWeight: '700' },
});
