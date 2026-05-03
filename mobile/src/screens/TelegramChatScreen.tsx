import React, { useMemo, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { SettingsStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';

type Msg = { id: string; text: string; outgoing: boolean };

export function TelegramChatScreen() {
  const { colors } = useTheme();
  const route = useRoute<RouteProp<SettingsStackParamList, 'TelegramChat'>>();
  const { telegramChatId, title } = route.params;
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);

  const headerTitle = useMemo(() => title || `Telegram ${telegramChatId}`, [telegramChatId, title]);

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    setMessages((m) => [...m, { id: String(Date.now()), text: t, outgoing: true }]);
    setDraft('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.chatBackground }}>
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12 }}
        ListHeaderComponent={
          <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>
            {headerTitle} — MVP: отправка локальная; TDLib sendMessage подключите после libtdjson.
          </Text>
        }
        renderItem={({ item }) => (
          <View
            style={{
              alignSelf: item.outgoing ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              marginBottom: 8,
              padding: 10,
              borderRadius: 12,
              backgroundColor: item.outgoing ? colors.bubbleMe : colors.bubbleOther,
            }}
          >
            <Text
              style={{
                color: item.outgoing ? '#FFFFFF' : colors.textPrimary,
              }}
            >
              {item.text}
            </Text>
          </View>
        )}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: 8,
          borderTopWidth: 1,
          borderTopColor: colors.separator,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Сообщение"
          placeholderTextColor={colors.textSecondaryMuted}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: colors.separator,
            borderRadius: 20,
            paddingHorizontal: 14,
            paddingVertical: 8,
            color: colors.textPrimary,
          }}
          onSubmitEditing={send}
        />
        <Text onPress={send} style={{ marginLeft: 12, color: colors.accent, fontWeight: '700' }}>
          Отпр.
        </Text>
      </View>
    </View>
  );
}
