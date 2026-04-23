import React, { useEffect } from 'react';
import { View } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

export interface AnimatedPlayPauseIconProps {
  isPlaying: boolean;
  color: string;
  size?: number;
}

export const AnimatedPlayPauseIcon = React.memo(function AnimatedPlayPauseIcon({
  isPlaying,
  color,
  size = 18,
}: AnimatedPlayPauseIconProps) {
  const progress = useSharedValue(isPlaying ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(isPlaying ? 1 : 0, {
      damping: 14,
      stiffness: 180,
      mass: 0.8,
    });
  }, [isPlaying, progress]);

  const playStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      opacity: 1 - progress.value,
      transform: [
        { scale: 1 - progress.value * 0.5 },
        { rotate: `${progress.value * 180}deg` },
      ],
    };
  });

  const pauseStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      opacity: progress.value,
      transform: [
        { scale: 0.5 + progress.value * 0.5 },
        { rotate: `${(1 - progress.value) * -180}deg` },
      ],
    };
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Reanimated.View style={[playStyle, { marginLeft: Math.round(size * 0.1) }]}>
        <Ionicons name="play" size={size} color={color} />
      </Reanimated.View>
      <Reanimated.View style={pauseStyle}>
        <Ionicons name="pause" size={size} color={color} />
      </Reanimated.View>
    </View>
  );
});
