import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import type { ChatsStackParamList } from '../navigation/types';
import { fetchChannelDetail, updateChannel } from '../services/channelService';
import { channelStore } from '../stores/channelStore';
import { chatStore } from '../stores/chatStore';
import { colors } from '../theme/colors';

type Route = RouteProp<ChatsStackParamList, 'ChannelAdmin'>;

export function ChannelAdminScreen() {
  const route = useRoute<Route>();
  const { channelId } = route.params;
  const detail = channelStore((state) => state.detailsById[channelId]);
  const canEdit = detail?.channel_permissions?.can_edit_channel === true;

  const [name, setName] = React.useState(detail?.channel.name ?? '');
  const [description, setDescription] = React.useState(detail?.channel.description ?? '');
  const [allowComments, setAllowComments] = React.useState(detail?.channel.allow_comments !== 0);
  const [allowReactions, setAllowReactions] = React.useState(detail?.channel.allow_reactions !== 0);
  const [price, setPrice] = React.useState(
    detail?.channel.subscription_price_cents != null
      ? (detail.channel.subscription_price_cents / 100).toFixed(2)
      : '4.99',
  );
  const [snackbar, setSnackbar] = React.useState<string | null>(null);

  const showSnackbar = React.useCallback((message: string) => {
    setSnackbar(message);
  }, []);

  React.useEffect(() => {
    if (!snackbar) return;
    const timer = setTimeout(() => setSnackbar(null), 1800);
    return () => clearTimeout(timer);
  }, [snackbar]);

  React.useEffect(() => {
    if (detail) return;
    void fetchChannelDetail(channelId).then((next) => {
      channelStore.getState().setDetail(channelId, next);
      chatStore.getState().addOrUpdateChat(next.channel);
      setName(next.channel.name ?? '');
      setDescription(next.channel.description ?? '');
      setAllowComments(next.channel.allow_comments !== 0);
      setAllowReactions(next.channel.allow_reactions !== 0);
      setPrice(
        next.channel.subscription_price_cents != null
          ? (next.channel.subscription_price_cents / 100).toFixed(2)
          : '4.99',
      );
    });
  }, [channelId, detail]);

  const handleSave = React.useCallback(async () => {
    if (!canEdit) return showSnackbar('Недостаточно прав для изменения настроек');
    try {
      const updated = await updateChannel(channelId, {
        name,
        description,
        allow_comments: allowComments,
        allow_reactions: allowReactions,
        subscription_price_cents:
          detail?.channel.access_type === 'paid' ? Math.round(Number(price || '0') * 100) : undefined,
      });
      channelStore.getState().upsertChannel(updated);
      chatStore.getState().addOrUpdateChat(updated);
      showSnackbar('Настройки канала обновлены');
    } catch (error) {
      Alert.alert(
        'Не удалось сохранить',
        error instanceof Error ? error.message : 'Попробуйте еще раз.',
      );
    }
  }, [allowComments, allowReactions, canEdit, channelId, description, detail?.channel.access_type, name, price, showSnackbar]);

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {!canEdit ? (
          <View style={styles.noRightsCard}>
            <Feather name="lock" size={14} color="#92400E" />
            <Text style={styles.noRightsText}>Недостаточно прав для изменения настроек канала.</Text>
          </View>
        ) : null}

        <Text style={styles.label}>Название канала</Text>
        <TextInput value={name} onChangeText={setName} style={styles.input} editable={canEdit} />

        <Text style={styles.label}>Описание</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          style={[styles.input, styles.textArea]}
          multiline
          editable={canEdit}
        />

        {detail?.channel.access_type === 'paid' ? (
          <>
            <Text style={styles.label}>Цена подписки</Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              style={styles.input}
              keyboardType="decimal-pad"
              editable={canEdit}
            />
          </>
        ) : null}

        <View style={[styles.row, !canEdit && styles.rowDisabled]}>
          <Text style={styles.rowLabel}>Разрешить комментарии</Text>
          <Switch value={allowComments} onValueChange={setAllowComments} disabled={!canEdit} />
        </View>

        <View style={[styles.row, !canEdit && styles.rowDisabled]}>
          <Text style={styles.rowLabel}>Разрешить реакции</Text>
          <Switch value={allowReactions} onValueChange={setAllowReactions} disabled={!canEdit} />
        </View>

        <View style={styles.statsCard}>
          <Text style={styles.statsLine}>Подписчиков: {detail?.channel.subscriber_count ?? 0}</Text>
          <Text style={styles.statsLine}>Активных: {detail?.channel.active_subscriber_count ?? 0}</Text>
          <Text style={styles.statsLine}>
            Ожидаемые выплаты: ${(detail?.channel.pending_earnings_cents ?? 0) / 100}
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            !canEdit && styles.buttonDisabled,
          ]}
          onPress={() => void handleSave()}
        >
          <Text style={styles.buttonText}>Сохранить изменения</Text>
        </Pressable>
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
  screen: { flex: 1, backgroundColor: '#F4F7FB' },
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  noRightsCard: {
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noRightsText: {
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
  },
  label: {
    marginBottom: 8,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  input: {
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  rowDisabled: { opacity: 0.65 },
  rowLabel: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  statsCard: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginTop: 4,
  },
  statsLine: {
    color: colors.textPrimary,
    lineHeight: 22,
  },
  button: {
    marginTop: 16,
    borderRadius: 18,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  buttonPressed: { opacity: 0.9 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
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
