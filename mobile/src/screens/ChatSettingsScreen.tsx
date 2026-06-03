import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { uiStore, type ChatListFilter } from '../stores/uiStore';

const OPTIONS: { value: ChatListFilter; label: string; hint: string }[] = [
  { value: 'all', label: 'Все чаты', hint: 'Показывать Chatus и Telegram вместе' },
  { value: 'chatus_only', label: 'Только Chatus', hint: 'Показывать только чаты Chatus' },
  { value: 'telegram_only', label: 'Только Telegram', hint: 'Показывать только чаты Telegram' },
];

const FILTER_DESCRIPTIONS: Record<ChatListFilter, string> = {
  all: 'Все чаты',
  chatus_only: 'Только Chatus',
  telegram_only: 'Только Telegram',
};

export function ChatSettingsScreen() {
  const { colors } = useTheme();
  const chatListFilter = uiStore((s) => s.chatListFilter);

  return (
    <View style={[styles.container, { backgroundColor: colors.chatBackground }]}>
      <Text style={[styles.caption, { color: colors.textSecondary }]}>
        Сейчас: {FILTER_DESCRIPTIONS[chatListFilter]}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.inputBackgroundSolid }]}>
        {OPTIONS.map((opt, index) => {
          const active = chatListFilter === opt.value;
          return (
            <View key={opt.value}>
              {index > 0 ? (
                <View style={[styles.hairline, { backgroundColor: colors.separator }]} />
              ) : null}
              <Pressable
                onPress={() => uiStore.getState().setChatListFilter(opt.value)}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: active ? colors.rowPressed : 'transparent' },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.title, { color: colors.textPrimary }]}>{opt.label}</Text>
                  <Text style={[styles.hint, { color: colors.textSecondary }]}>{opt.hint}</Text>
                </View>
                {active ? (
                  <Text style={[styles.check, { color: colors.accent }]}>✓</Text>
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  caption: { fontSize: 14, marginBottom: 12 },
  card: { borderRadius: 12, overflow: 'hidden' },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowText: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 13, marginTop: 2 },
  check: { fontSize: 18, fontWeight: '700', marginLeft: 8 },
});
