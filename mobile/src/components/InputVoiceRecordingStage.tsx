import React, { useMemo } from 'react';
import {
  Animated as RNAnimated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { VoiceRecorderService } from '../services/VoiceRecorderService';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LIVE_WAVEFORM_BAR_COUNT = 28;
const LIVE_WAVEFORM_FALLBACK = Array(LIVE_WAVEFORM_BAR_COUNT).fill(0.06);

type AnimatedStyle = React.ComponentProps<typeof RNAnimated.View>['style'];
type PanHandlers = ReturnType<typeof PanResponder.create>['panHandlers'];

type InputVoiceRecordingStageProps = {
  recordingStartedAtMs: number;
  isLocked: boolean;
  voiceTouchTracking: boolean;
  panHandlers: PanHandlers;
  recordingBubbleStyle: AnimatedStyle;
  recordingBubbleCancelTintStyle: AnimatedStyle;
  recordingLiveContentStyle: AnimatedStyle;
  recordingCancelContentStyle: AnimatedStyle;
  recordingLockStyle: AnimatedStyle;
  recordingUnlockIconStyle: AnimatedStyle;
  recordingLockIconStyle: AnimatedStyle;
  onCancel: () => void;
  onSend: () => void;
};

function VoiceSendIcon() {
  return <Feather name="arrow-up" size={20} color="#FFFFFF" />;
}

function createVoiceRecordingStyles(c: ThemeColors, isDark: boolean, bottomInset: number) {
  const bubbleBg = c.composerSurface;
  const bubbleBorder = c.composerBorder;
  const lockBubbleBg = c.inputBackgroundSolid;
  const lockBubbleBorder = isDark ? c.bubbleOtherBorder : '#CFE0FF';
  const leadingBg = isDark ? withAlpha(c.accent, 0.2) : '#EFF6FF';
  const cancelTint = isDark ? 'rgba(248, 113, 113, 0.22)' : '#FFF1F1';
  const cancelText = isDark ? '#FCA5A5' : '#F16E6E';
  const bottomBarBg = c.inputBackgroundSolid;
  const bottomBarBorder = c.separator;

  return StyleSheet.create({
    recordingStage: {
      position: 'relative',
      gap: 10,
    },
    recordingGestureLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 8,
    },
    recordingTopLayer: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      left: 0,
      top: 0,
      justifyContent: 'center',
      overflow: 'visible',
    },
    recordingLockBubble: {
      position: 'absolute',
      bottom: 60,
      right: -8,
      width: 48,
      height: 100,
      borderRadius: 24,
      backgroundColor: lockBubbleBg,
      borderColor: lockBubbleBorder,
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: 12,
      borderWidth: 1,
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
      zIndex: 6,
    },
    recordingLockIcon: {
      position: 'absolute',
      top: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recordingChevron: {
      marginTop: 24,
    },
    recordingBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      zIndex: 2,
      flex: 1,
      backgroundColor: 'transparent',
    },
    recordingBubbleCancelTint: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 30,
      backgroundColor: cancelTint,
    },
    recordingLeadingCircle: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 4,
    },
    recordingLeadingCircleLocked: {
      // not used
    },
    recordingBubbleContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      minHeight: 46,
      position: 'relative',
    },
    recordingLiveContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    recordingTimerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 8,
    },
    recordingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#FF5353',
      marginRight: 8,
    },
    recordingTime: {
      fontSize: 15,
      fontWeight: '500',
      color: c.textSecondary,
    },
    recordingWaveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      flex: 1,
    },
    recordingWaveBar: {
      width: 3,
      borderRadius: 999,
    },
    recordingCancelOverlay: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 4,
    },
    recordingCancelOverlayText: {
      fontSize: 16,
      fontWeight: '500',
      color: c.textSecondary,
    },
    recordingBubbleSendButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#005FFF',
      marginLeft: 6,
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0.4 : 0.22,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    recordingBubbleSendButtonPressed: {
      opacity: 0.88,
    },
    recordingBubbleSendButtonUnlocked: {
      opacity: 0.96,
    },
    recordingBubbleDeleteButton: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

export const InputVoiceRecordingStage = React.memo(function InputVoiceRecordingStage({
  recordingStartedAtMs,
  isLocked,
  voiceTouchTracking,
  panHandlers,
  recordingBubbleStyle,
  recordingBubbleCancelTintStyle,
  recordingLiveContentStyle,
  recordingCancelContentStyle,
  recordingLockStyle,
  recordingUnlockIconStyle,
  recordingLockIconStyle,
  onCancel,
  onSend,
}: InputVoiceRecordingStageProps) {
  const { colors: themeColors, resolvedScheme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = resolvedScheme === 'dark';
  const styles = useMemo(
    () => createVoiceRecordingStyles(themeColors, isDark, insets.bottom),
    [themeColors, isDark, insets.bottom],
  );

  const waveColors = useMemo(
    () => ({
      peak: themeColors.accent,
      quiet: isDark ? withAlpha(themeColors.accent, 0.38) : '#BFD9FF',
    }),
    [isDark, themeColors.accent],
  );

  const lockIconUnlockColor = isDark ? themeColors.link : '#5A9BFF';
  const lockIconLockColor = themeColors.accent;
  const cancelAccentColor = isDark ? '#FCA5A5' : '#F16E6E';

  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [liveWaveform, setLiveWaveform] = React.useState<number[]>(LIVE_WAVEFORM_FALLBACK);
  const recordingPulse = React.useRef(new RNAnimated.Value(1)).current;

  React.useEffect(() => {
    if (!recordingStartedAtMs) {
      setElapsedMs(0);
      return;
    }

    const updateElapsed = () => {
      setElapsedMs(Math.max(0, Date.now() - recordingStartedAtMs));
    };

    updateElapsed();

    const timer = setInterval(() => {
      updateElapsed();
    }, 200);

    return () => clearInterval(timer);
  }, [recordingStartedAtMs]);

  React.useEffect(() => {
    const unsubscribe = VoiceRecorderService.subscribeToLiveWaveform((nextWaveform) => {
      setLiveWaveform(nextWaveform.length > 0 ? nextWaveform : LIVE_WAVEFORM_FALLBACK);
    });

    return unsubscribe;
  }, []);

  React.useEffect(() => {
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(recordingPulse, {
          toValue: 0.25,
          duration: 520,
          useNativeDriver: true,
          easing: Easing.linear,
        }),
        RNAnimated.timing(recordingPulse, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
          easing: Easing.linear,
        }),
      ]),
    );

    loop.start();

    return () => {
      loop.stop();
      recordingPulse.stopAnimation();
      recordingPulse.setValue(1);
    };
  }, [recordingPulse]);

  const voiceElapsedLabel = React.useMemo(() => {
    const minutes = Math.floor(elapsedMs / 60000).toString();
    const seconds = Math.floor((elapsedMs % 60000) / 1000)
      .toString()
      .padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [elapsedMs]);

  const liveBarHeights = React.useMemo(
    () =>
      liveWaveform.map((value) => {
        const normalized = Math.max(0, Math.min(1, value ?? 0.06));
        return 3 + Math.pow(normalized, 1.05) * 12;
      }),
    [liveWaveform],
  );

  return (
    <View style={styles.recordingStage}>
      {voiceTouchTracking && !isLocked ? (
        <View style={styles.recordingGestureLayer} {...panHandlers} />
      ) : null}

      <View style={styles.recordingTopLayer}>
        <RNAnimated.View style={[styles.recordingLockBubble, recordingLockStyle]}>
          <RNAnimated.View style={[styles.recordingLockIcon, recordingUnlockIconStyle]}>
            <Feather name="unlock" size={18} color={lockIconUnlockColor} />
          </RNAnimated.View>
          <RNAnimated.View style={[styles.recordingLockIcon, recordingLockIconStyle]}>
            <Feather name="lock" size={18} color={lockIconLockColor} />
          </RNAnimated.View>
          <RNAnimated.View style={[styles.recordingChevron, recordingUnlockIconStyle]}>
            <Feather name="chevron-up" size={18} color={themeColors.iconMuted} />
          </RNAnimated.View>
        </RNAnimated.View>

        <RNAnimated.View style={[styles.recordingBubble, recordingBubbleStyle, recordingLiveContentStyle]}>
          <RNAnimated.View
            pointerEvents="none"
            style={[styles.recordingBubbleCancelTint, recordingBubbleCancelTintStyle]}
          />

          {isLocked ? (
            <Pressable
              style={styles.recordingBubbleDeleteButton}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Delete recording"
            >
              <Feather name="trash-2" size={24} color={themeColors.iconMuted} />
            </Pressable>
          ) : (
            <View style={styles.recordingLiveContent}>
              <View
                style={[
                  styles.recordingLeadingCircle,
                  isLocked && styles.recordingLeadingCircleLocked,
                ]}
              >
                <Feather name={'mic'} size={24} color={'#FF5353'} />
              </View>

              <View style={styles.recordingTimerRow}>
                <Text style={styles.recordingTime}>{voiceElapsedLabel}</Text>
              </View>
            </View>
          )}

          {isLocked && (
            <View style={styles.recordingTimerRow}>
              <Text style={styles.recordingTime}>{voiceElapsedLabel}</Text>
            </View>
          )}

          <View style={styles.recordingWaveRow}>
            {liveBarHeights.map((height, index) => (
              <View
                key={`recording-bar-${index}`}
                style={[
                  styles.recordingWaveBar,
                  {
                    height,
                    opacity: 0.48 + (index / Math.max(liveBarHeights.length - 1, 1)) * 0.52,
                    backgroundColor: height >= 14 ? waveColors.peak : waveColors.quiet,
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.recordingBubbleContent}>

            <RNAnimated.View
              pointerEvents="none"
              style={[styles.recordingCancelOverlay, recordingCancelContentStyle]}
            >
              <Text style={styles.recordingCancelOverlayText}>Отменить</Text>
              <Feather name="chevron-left" size={18} color={themeColors.iconMuted} />
            </RNAnimated.View>
          </View>

          {isLocked && (
            <Pressable
              style={({ pressed }) => [
                styles.recordingBubbleSendButton,
                pressed && styles.recordingBubbleSendButtonPressed,
              ]}
              onPress={onSend}
            >
              <VoiceSendIcon />
            </Pressable>
          )}

        </RNAnimated.View>
      </View>
    </View>
  );
});
