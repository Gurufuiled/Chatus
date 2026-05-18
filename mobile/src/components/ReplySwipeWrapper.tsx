import React from 'react';
import { StyleSheet, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../contexts/ThemeContext';

const REPLY_SWIPE_TRIGGER = 34;
const REPLY_SWIPE_MAX = 72;

function clampReplySwipe(value: number) {
  'worklet';
  return Math.max(-REPLY_SWIPE_MAX, Math.min(0, value));
}

type ReplySwipeWrapperProps = {
  enabled: boolean;
  onReply: () => void;
  children: React.ReactNode;
};

export const ReplySwipeWrapper = React.memo(function ReplySwipeWrapper({
  enabled,
  onReply,
  children,
}: ReplySwipeWrapperProps) {
  const { colors, resolvedScheme } = useTheme();
  const iconWrapBg =
    resolvedScheme === 'dark' ? 'rgba(30, 36, 48, 0.92)' : 'rgba(255, 255, 255, 0.94)';
  const translateX = useSharedValue(0);
  const hasTriggered = useSharedValue(false);
  const triggerPop = useSharedValue(0);

  const gesture = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(-12)
    .failOffsetY([-12, 12])
    .onBegin(() => {
      hasTriggered.value = false;
    })
    .onUpdate((event) => {
      if (event.translationX > 0) {
        translateX.value = 0;
        return;
      }

      const nextX = clampReplySwipe(event.translationX);
      translateX.value = nextX;

      if (!hasTriggered.value && nextX <= -REPLY_SWIPE_TRIGGER) {
        hasTriggered.value = true;
        triggerPop.value = withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 120 }));
        runOnJS(onReply)();
      }
    })
    .onFinalize(() => {
      translateX.value = withTiming(0, { duration: 140 });
      hasTriggered.value = false;
    });

  const contentStyle = useAnimatedStyle(() => {
    const scale = interpolate(triggerPop.value, [0, 1], [1, 0.985], Extrapolation.CLAMP);

    return {
      transform: [{ translateX: translateX.value }, { scale }] as const,
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    const progress = Math.abs(translateX.value) / REPLY_SWIPE_TRIGGER;
    const opacity = interpolate(progress, [0, 0.3, 1], [0, 0.45, 1], Extrapolation.CLAMP);
    const baseScale = interpolate(progress, [0, 1], [0.84, 1], Extrapolation.CLAMP);
    const scaleBoost = interpolate(triggerPop.value, [0, 1], [0, 0.18], Extrapolation.CLAMP);

    return {
      opacity,
      transform: [{ scale: baseScale + scaleBoost }],
    };
  });

  if (!enabled) {
    return <View style={styles.replyGestureContainer}>{children}</View>;
  }

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.replyGestureContainer}>
        <Reanimated.View style={[styles.replySwipeAction, iconStyle]}>
          <View style={[styles.replySwipeIconWrap, { backgroundColor: iconWrapBg }]}>
            <Feather name="corner-left-up" size={18} color={colors.accent} />
          </View>
        </Reanimated.View>
        <Reanimated.View style={[styles.replyGestureContent, contentStyle]}>{children}</Reanimated.View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  replyGestureContainer: {
    width: '100%',
    justifyContent: 'center',
  },
  replyGestureContent: {
    width: '100%',
  },
  replySwipeAction: {
    position: 'absolute',
    right: 16,
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  replySwipeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
