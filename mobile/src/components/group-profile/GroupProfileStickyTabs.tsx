import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme/palettes';
import { withAlpha } from '../../theme/stylePrimitives';

type GroupProfileStickyTabsProps = {
  activeTab: string;
  tabs: ReadonlyArray<readonly [string, string]>;
  onSelectTab: (tab: string) => void;
};

function createStickyTabsStyles(c: ThemeColors) {
  return StyleSheet.create({
    stickyTabsShell: {
      marginTop: 16,
      paddingTop: 4,
      paddingBottom: 6,
      backgroundColor: c.chatBackground,
    },
    tabsCard: {
      padding: 6,
      borderRadius: 22,
      backgroundColor: c.inputBackgroundSolid,
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      shadowColor: '#000000',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    tabButton: {
      flex: 1,
      minHeight: 36,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabButtonActive: {
      backgroundColor: withAlpha(c.accent, 0.14),
    },
    tabButtonText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: c.textSecondary,
    },
    tabButtonTextActive: {
      color: c.accent,
    },
    cardPressed: {
      opacity: 0.84,
    },
  });
}

export function GroupProfileStickyTabs({
  activeTab,
  tabs,
  onSelectTab,
}: GroupProfileStickyTabsProps) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createStickyTabsStyles(themeColors), [themeColors]);

  return (
    <View style={styles.stickyTabsShell}>
      <View style={styles.tabsCard}>
        {tabs.map(([tabKey, label]) => {
          const isActive = activeTab === tabKey;
          return (
            <Pressable
              key={tabKey}
              onPress={() => onSelectTab(tabKey)}
              style={({ pressed }) => [
                styles.tabButton,
                isActive && styles.tabButtonActive,
                pressed && styles.cardPressed,
              ]}
            >
              <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
