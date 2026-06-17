import React from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet } from 'react-native';

type ChatScrollToBottomButtonProps = {
  visible: boolean;
  bottom: number;
  onPress: () => void;
};

export const ChatScrollToBottomButton = React.memo(function ChatScrollToBottomButton({
  visible,
  bottom,
  onPress,
}: ChatScrollToBottomButtonProps) {
  if (!visible) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Прокрутить к новым сообщениям"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { bottom },
        pressed && styles.buttonPressed,
      ]}
    >
      <Feather name="chevron-down" size={22} color="#FFFFFF" />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(18, 22, 28, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    zIndex: 20,
    elevation: 5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
  },
  buttonPressed: {
    opacity: 0.78,
  },
});
