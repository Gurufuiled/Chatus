import React, { useCallback, useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { telegramAccountStore, type TelegramDialogRow } from '../stores/telegramAccountStore';
import { tdlibClient } from '../services/tdlib/TdlibClient';

export function TelegramDialogsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const dialogs = telegramAccountStore((s) => s.dialogs);

  const refresh = useCallback(async () => {
    try {
      const res = (await tdlibClient.send({
        '@type': 'getChats',
        chat_list: { '@type': 'chatListMain' },
        limit: 50,
      })) as { '@type'?: string; chat_ids?: number[] };
      if (res?.chat_ids?.length) {
        const rows: TelegramDialogRow[] = res.chat_ids.map((id) => ({
          id: String(id),
          chatId: String(id),
          title: `Chat ${id}`,
          lastMessagePreview: '',
        }));
        telegramAccountStore.getState().setDialogs(rows);
        await telegramAccountStore.getState().persistSnapshot();
      }
    } catch {
      /* stub: ignore */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const renderItem = useCallback(
    ({ item }: { item: TelegramDialogRow }) => (
      <Pressable
        onPress={() =>
          navigation.navigate('TelegramChat', { telegramChatId: item.chatId, title: item.title })
        }
        style={({ pressed }) => ({
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.separator,
          backgroundColor: pressed ? colors.inputBackgroundSolid : colors.chatBackground,
        })}
      >
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>{item.title}</Text>
        {item.lastMessagePreview ? (
          <Text style={{ marginTop: 4, color: colors.textSecondary }} numberOfLines={2}>
            {item.lastMessagePreview}
          </Text>
        ) : null}
      </Pressable>
    ),
    [colors, navigation],
  );

  const empty = useMemo(
    () => (
      <View style={{ padding: 24 }}>
        <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
          Диалогов пока нет. После подключения настоящего TDLib здесь появятся чаты из Telegram.
        </Text>
      </View>
    ),
    [colors.textSecondary],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.chatBackground }}>
      <FlatList
        data={dialogs}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={empty}
      />
    </View>
  );
}
