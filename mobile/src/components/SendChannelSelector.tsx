import * as React from 'react';
import { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import type { MessageSource } from '../stores/types';
import { PlatformSourceIcon } from './PlatformSourceIcon';
import { useTheme } from '../contexts/ThemeContext';

interface SendChannelSelectorProps {
  visible: boolean;
  currentChannel: MessageSource;
  onSelect: (channel: MessageSource) => void;
  onDismiss: () => void;
  telegramAvailable: boolean;
}

export function SendChannelSelector({
  visible,
  currentChannel,
  onSelect,
  onDismiss,
  telegramAvailable,
}: SendChannelSelectorProps) {
  const { colors: themeColors } = useTheme();
  const translateY = useSharedValue(8);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.95);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
      opacity.value = withTiming(1, { duration: 120 });
      scale.value = withSpring(1, { damping: 18, stiffness: 280 });
    } else {
      translateY.value = withTiming(8, { duration: 120 });
      opacity.value = withTiming(0, { duration: 120 });
      scale.value = withTiming(0.95, { duration: 120 });
    }
  }, [visible, translateY, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ] as any,
    opacity: opacity.value,
  }));

  if (!visible && opacity.value === 0) return null;

  return (
    <>
      {/* Transparent dismiss overlay — covers entire screen via large negative insets */}
      <Pressable
        style={styles.dismissOverlay}
        onPress={onDismiss}
      />
      {/* Popover container — positioned above the parent wrapper */}
      <Reanimated.View
        style={[
          styles.popover,
          {
            backgroundColor: themeColors.composerSurface,
            borderColor: themeColors.composerBorder,
          },
          animatedStyle,
        ]}
      >
        <Text style={[styles.title, { color: themeColors.textPrimary }]}>
          Отправить через
        </Text>

        <Pressable
          style={[
            styles.option,
            { backgroundColor: themeColors.inputBackground },
            currentChannel === 'chatus' && styles.optionSelected,
          ]}
          onPress={() => {
            onSelect('chatus');
            onDismiss();
          }}
        >
          <PlatformSourceIcon source="chatus" size={24} style={styles.icon} />
          <Text
            style={[
              styles.optionText,
              { color: themeColors.textPrimary },
              currentChannel === 'chatus' && styles.optionTextSelected,
            ]}
          >
            Chatus
          </Text>
        </Pressable>

        {telegramAvailable && (
          <Pressable
            style={[
              styles.option,
              { backgroundColor: themeColors.inputBackground },
              currentChannel === 'telegram' && styles.optionSelected,
            ]}
            onPress={() => {
              onSelect('telegram');
              onDismiss();
            }}
          >
            <PlatformSourceIcon source="telegram" size={24} style={styles.icon} />
            <Text
              style={[
                styles.optionText,
                { color: themeColors.textPrimary },
                currentChannel === 'telegram' && styles.optionTextSelected,
              ]}
            >
              Telegram
            </Text>
          </Pressable>
        )}
      </Reanimated.View>
    </>
  );
}

const styles = StyleSheet.create({
  dismissOverlay: {
    position: 'absolute',
    top: -9999,
    left: -9999,
    right: -9999,
    bottom: -9999,
    zIndex: 0,
  },
  popover: {
    position: 'absolute',
    bottom: '100%',
    right: 0,
    minWidth: 200,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 1,
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    // Android elevation
    elevation: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 6,
  },
  optionSelected: {
    backgroundColor: 'rgba(52, 165, 228, 0.1)',
    borderColor: '#34A5E4',
    borderWidth: 1,
  },
  icon: {
    marginRight: 12,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#34A5E4',
    fontWeight: '600',
  },
});
