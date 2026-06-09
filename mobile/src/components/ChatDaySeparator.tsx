import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

type ChatDaySeparatorProps = {
  label: string;
};

export const ChatDaySeparator = React.memo(function ChatDaySeparator({
  label,
}: ChatDaySeparatorProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={[styles.pill, { backgroundColor: colors.bubbleOther, borderColor: colors.bubbleOtherBorder }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
