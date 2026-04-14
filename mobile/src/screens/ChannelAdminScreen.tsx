import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
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
  const [name, setName] = React.useState(detail?.channel.name ?? '');
  const [description, setDescription] = React.useState(detail?.channel.description ?? '');
  const [allowComments, setAllowComments] = React.useState(
    detail?.channel.allow_comments !== 0
  );
  const [allowReactions, setAllowReactions] = React.useState(
    detail?.channel.allow_reactions !== 0
  );
  const [price, setPrice] = React.useState(
    detail?.channel.subscription_price_cents != null
      ? (detail.channel.subscription_price_cents / 100).toFixed(2)
      : '4.99'
  );

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
          : '4.99'
      );
    });
  }, [channelId, detail]);

  const handleSave = React.useCallback(async () => {
    try {
      const updated = await updateChannel(channelId, {
        name,
        description,
        allow_comments: allowComments,
        allow_reactions: allowReactions,
        subscription_price_cents:
          detail?.channel.access_type === 'paid'
            ? Math.round(Number(price || '0') * 100)
            : undefined,
      });
      channelStore.getState().upsertChannel(updated);
      chatStore.getState().addOrUpdateChat(updated);
      Alert.alert('Сохранено', 'Настройки канала обновлены.');
    } catch (error) {
      Alert.alert(
        'Не удалось сохранить',
        error instanceof Error ? error.message : 'Попробуйте еще раз.'
      );
    }
  }, [allowComments, allowReactions, channelId, description, detail?.channel.access_type, name, price]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Название канала</Text>
      <TextInput value={name} onChangeText={setName} style={styles.input} />

      <Text style={styles.label}>Описание</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        style={[styles.input, styles.textArea]}
        multiline
      />

      {detail?.channel.access_type === 'paid' ? (
        <>
          <Text style={styles.label}>Цена подписки</Text>
          <TextInput
            value={price}
            onChangeText={setPrice}
            style={styles.input}
            keyboardType="decimal-pad"
          />
        </>
      ) : null}

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Разрешить комментарии</Text>
        <Switch value={allowComments} onValueChange={setAllowComments} />
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Разрешить реакции</Text>
        <Switch value={allowReactions} onValueChange={setAllowReactions} />
      </View>

      <View style={styles.statsCard}>
        <Text style={styles.statsLine}>
          Подписчиков: {detail?.channel.subscriber_count ?? 0}
        </Text>
        <Text style={styles.statsLine}>
          Активных: {detail?.channel.active_subscriber_count ?? 0}
        </Text>
        <Text style={styles.statsLine}>
          Ожидаемые выплаты: ${(detail?.channel.pending_earnings_cents ?? 0) / 100}
        </Text>
      </View>

      <Pressable style={styles.button} onPress={() => void handleSave()}>
        <Text style={styles.buttonText}>Сохранить изменения</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  content: {
    padding: 16,
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
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
