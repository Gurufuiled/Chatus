import React from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type ForwardHeaderProps = {
  isMe: boolean;
  name?: string | null;
  onPress?: (() => void) | undefined;
  meColor?: string;
};

export const ForwardHeader = React.memo(function ForwardHeader({
  isMe,
  name,
  onPress,
  meColor,
}: ForwardHeaderProps) {
  const label = name?.trim()
    ? `Переслано от ${name.trim()}`
    : 'Пересланное сообщение';
  const resolvedMeColor = meColor ?? '#DFF2A8';

  const content = (
    <>
      <Feather
        name="corner-up-right"
        size={12}
        color={isMe ? resolvedMeColor : '#4D8DFF'}
        style={styles.icon}
      />
      <Text
        numberOfLines={1}
        style={[
          styles.text,
          isMe ? styles.textMe : styles.textOther,
          isMe && meColor ? { color: meColor } : null,
        ]}
      >
        {label}
      </Text>
      {onPress ? (
        <Feather
          name="chevron-right"
          size={12}
          color={isMe ? resolvedMeColor : 'rgba(77,141,255,0.92)'}
        />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.wrap}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && styles.wrapPressed]}
    >
      {content}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 5,
    minWidth: 0,
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingRight: 2,
  },
  wrapPressed: {
    opacity: 0.72,
  },
  icon: {
    marginTop: 1,
  },
  text: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  textMe: {
    color: '#DFF2A8',
  },
  textOther: {
    color: '#4D8DFF',
  },
});
