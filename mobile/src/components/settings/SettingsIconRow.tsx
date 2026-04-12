import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TelegramGlyph, type TelegramGlyphFillRule } from '../../icons/telegram';
import { colors, withAlpha } from '../../theme/colors';

export type SettingsIconRowProps = {
  title: string;
  subtitle?: string;
  iconD: string;
  iconFillRule?: TelegramGlyphFillRule;
  iconColor?: string;
  onPress?: () => void;
  /** Показать бейдж «Скоро» (UI-only, логика не подключена). */
  placeholder?: boolean;
  destructive?: boolean;
  showChevron?: boolean;
  testID?: string;
};

/**
 * Строка настроек в стиле Telegram: круглая подложка + vector-иконка + заголовок.
 */
export function SettingsIconRow({
  title,
  subtitle,
  iconD,
  iconFillRule = 'nonzero',
  iconColor = colors.accent,
  onPress,
  placeholder = false,
  destructive = false,
  showChevron = true,
  testID,
}: SettingsIconRowProps) {
  const content = (
    <>
      <View style={styles.iconBubble}>
        <TelegramGlyph d={iconD} fillRule={iconFillRule} color={iconColor} size={22} />
      </View>
      <View style={styles.textBlock}>
        <Text
          style={[styles.title, destructive && styles.titleDestructive]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {placeholder ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Скоро</Text>
        </View>
      ) : null}
      {showChevron ? <Text style={styles.chevron}>›</Text> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={styles.row}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 52,
    backgroundColor: colors.inputBackgroundSolid,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  rowPressed: {
    backgroundColor: colors.inputBackground,
  },
  iconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: withAlpha(colors.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  titleDestructive: {
    color: '#E53935',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textSecondary,
  },
  badge: {
    marginRight: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.inputBackground,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  chevron: {
    fontSize: 22,
    color: colors.textSecondary,
    marginLeft: 4,
    fontWeight: '300',
  },
});
