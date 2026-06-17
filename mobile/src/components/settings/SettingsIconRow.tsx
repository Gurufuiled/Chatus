import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { TelegramGlyph, type TelegramGlyphFillRule } from '../../icons/telegram';
import { useTheme } from '../../contexts/ThemeContext';
import { createSettingsIconRowStyles } from './settingsIconRow.styles';

export type SettingsIconRowProps = {
  title: string;
  subtitle?: string;
  iconD: string;
  iconFillRule?: TelegramGlyphFillRule;
  iconColor?: string;
  iconBgColor?: string;
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
  iconColor,
  iconBgColor,
  onPress,
  placeholder = false,
  destructive = false,
  showChevron = true,
  testID,
}: SettingsIconRowProps) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createSettingsIconRowStyles(themeColors), [themeColors]);
  const resolvedIconColor = iconBgColor ? '#FFFFFF' : (iconColor ?? themeColors.accent);
  const resolvedIconBg = iconBgColor;

  const content = (
    <>
      <View style={[styles.iconBubble, resolvedIconBg ? { backgroundColor: resolvedIconBg } : null]}>
        <TelegramGlyph d={iconD} fillRule={iconFillRule} color={resolvedIconColor} size={22} />
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
