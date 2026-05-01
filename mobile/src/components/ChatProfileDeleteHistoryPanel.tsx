import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { withAlpha } from '../theme/stylePrimitives';

const DANGER = '#FF453A';

type Props = {
  peerName: string;
  showDeleteForBoth: boolean;
  onBack: () => void;
  onDeleteBoth: () => void;
  onDeleteMeOnly: () => void;
};

export function ChatProfileDeleteHistoryPanel({
  peerName,
  showDeleteForBoth,
  onBack,
  onDeleteBoth,
  onDeleteMeOnly,
}: Props) {
  const { colors, resolvedScheme } = useTheme();

  const subtitle = `Удалить всю историю переписки с ${peerName}?`;

  return (
    <View style={styles.root}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [styles.backRow, pressed && { opacity: 0.65 }]}
        hitSlop={10}
      >
        <Text style={[styles.backArrow, { color: colors.textPrimary }]}>←</Text>
        <Text style={[styles.backLabel, { color: colors.textPrimary }]}>Назад</Text>
      </Pressable>

      <View style={[styles.divider, { backgroundColor: colors.separator }]} />

      <Text style={[styles.prompt, { color: colors.textPrimary }]}>{subtitle}</Text>

      <View style={styles.actions}>
        {showDeleteForBoth ? (
          <Pressable
            onPress={onDeleteBoth}
            style={({ pressed }) => [styles.actionHit, pressed && { opacity: 0.75 }]}
          >
            <Text style={[styles.dangerText, { color: DANGER }]}>
              Удалить у меня и у {peerName}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onDeleteMeOnly}
          style={({ pressed }) => [styles.actionHit, pressed && { opacity: 0.75 }]}
        >
          <Text style={[styles.dangerText, { color: DANGER }]}>Удалить у меня</Text>
        </Pressable>
      </View>

      {resolvedScheme === 'light' ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: withAlpha('#FFFFFF', 0.04) }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
    minWidth: 248,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  backArrow: {
    fontSize: 18,
    fontWeight: '500',
  },
  backLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  prompt: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    marginBottom: 16,
  },
  actions: {
    gap: 14,
  },
  actionHit: {
    alignSelf: 'stretch',
    paddingVertical: 4,
  },
  dangerText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
