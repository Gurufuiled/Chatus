import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';

type GroupProfileStickyTabsProps = {
  activeTab: string;
  tabs: ReadonlyArray<readonly [string, string]>;
  onSelectTab: (tab: string) => void;
};

export function GroupProfileStickyTabs({
  activeTab,
  tabs,
  onSelectTab,
}: GroupProfileStickyTabsProps) {
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

const styles = StyleSheet.create({
  stickyTabsShell: {
    marginTop: 16,
    paddingTop: 4,
    paddingBottom: 6,
    backgroundColor: '#EEF1F7',
  },
  tabsCard: {
    padding: 6,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    shadowColor: '#A3AEC2',
    shadowOpacity: 0.08,
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
    backgroundColor: '#EDF4FF',
  },
  tabButtonText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#687385',
  },
  tabButtonTextActive: {
    color: colors.accent,
  },
  cardPressed: {
    opacity: 0.84,
  },
});
