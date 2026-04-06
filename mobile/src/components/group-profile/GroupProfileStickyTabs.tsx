import React from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';

type GroupProfileStickyTabsProps = {
  displayName: string;
  memberCountLabel: string;
  activeTab: string;
  tabs: ReadonlyArray<readonly [string, string]>;
  compactHeaderStyle: any;
  onBack: () => void;
  onSearch: () => void;
  onSelectTab: (tab: string) => void;
};

export function GroupProfileStickyTabs({
  displayName,
  memberCountLabel,
  activeTab,
  tabs,
  compactHeaderStyle,
  onBack,
  onSearch,
  onSelectTab,
}: GroupProfileStickyTabsProps) {
  return (
    <View style={styles.stickyTabsShell}>
      <Animated.View style={[styles.compactHeaderCard, compactHeaderStyle]}>
        <View style={styles.compactHeaderInner}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.compactIconButton, pressed && styles.cardPressed]}
          >
            <Feather name="chevron-left" size={20} color="#1F2937" />
          </Pressable>

          <View style={styles.compactTitleBlock}>
            <Text style={styles.compactTitle} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.compactSubtitle} numberOfLines={1}>
              {memberCountLabel}
            </Text>
          </View>

          <Pressable
            onPress={onSearch}
            style={({ pressed }) => [styles.compactIconButton, pressed && styles.cardPressed]}
          >
            <Feather name="search" size={18} color="#1F2937" />
          </Pressable>
        </View>
      </Animated.View>

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
  compactHeaderCard: {
    overflow: 'hidden',
  },
  compactHeaderInner: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 2,
  },
  compactIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#A3AEC2',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  compactTitleBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  compactTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  compactSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#7B8594',
  },
  tabsCard: {
    marginTop: 0,
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
