import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import type { AppAppearancePreference } from '../theme/palettes';

const OPTIONS: { value: AppAppearancePreference; label: string; hint: string }[] = [
  { value: 'system', label: 'Как в системе', hint: 'Следовать настройкам устройства' },
  { value: 'light', label: 'Светлая', hint: 'Светлое оформление' },
  { value: 'dark', label: 'Тёмная', hint: 'Тёмное оформление' },
];

export function AppearanceSettingsScreen() {
  const { colors, preference, setAppAppearancePreference, resolvedScheme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.chatBackground }]}>
      <Text style={[styles.caption, { color: colors.textSecondary }]}>
        Сейчас: {resolvedScheme === 'dark' ? 'тёмная' : 'светлая'}
        {preference === 'system' ? ' (как в системе)' : ''}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.inputBackgroundSolid }]}>
        {OPTIONS.map((opt, index) => {
          const active = preference === opt.value;
          return (
            <View key={opt.value}>
              {index > 0 ? (
                <View style={[styles.hairline, { backgroundColor: colors.separator }]} />
              ) : null}
              <Pressable
                onPress={() => setAppAppearancePreference(opt.value)}
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
