import React from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, View } from 'react-native';

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
    <View pointerEvents="box-none" style={[styles.host, { bottom }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Прокрутить к новым сообщениям"
        onPress={onPress}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Feather name="chevron-down" size={22} color="#FFFFFF" />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    right: 0,
    left: 0,
    zIndex: 35,
    elevation: 6,
    alignItems: 'flex-end',
    paddingRight: 12,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(18, 22, 28, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
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
