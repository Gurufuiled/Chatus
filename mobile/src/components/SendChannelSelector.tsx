import * as React from 'react';
import { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, Modal, TouchableWithoutFeedback } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import type { MessageSource } from '../stores/types';
import { PlatformSourceIcon } from './PlatformSourceIcon';
import { colors } from '../theme/colors';

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
  const translateY = useSharedValue(100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      opacity.value = withTiming(1, { duration: 150 });
    } else {
      translateY.value = withTiming(100, { duration: 150 });
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [visible, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible && opacity.value === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <Reanimated.View style={[styles.container, animatedStyle]}>
              <Text style={styles.title}>Отправить через</Text>

              <Pressable
                style={[
                  styles.option,
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
                      currentChannel === 'telegram' && styles.optionTextSelected,
                    ]}
                  >
                    Telegram
                  </Text>
                </Pressable>
              )}
            </Reanimated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  container: {
    backgroundColor: '#FFFFFF', // Use explicit white for generic fallback until themed
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1D21',
    marginBottom: 16,
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#F5F5F5',
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
    fontSize: 16,
    color: '#1A1D21',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#34A5E4',
    fontWeight: '600',
  },
});
