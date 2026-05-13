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
      minHeight: 152,
      justifyContent: 'flex-end',
      alignItems: 'flex-end',
      overflow: 'visible',
    },
    recordingLockBubble: {
      position: 'absolute',
      top: 12,
      right: 16,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: lockBubbleBg,
      borderColor: lockBubbleBorder,
      alignItems: 'center',
      justifyContent: 'center',
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
      alignItems: 'center',
      justifyContent: 'center',
    },
    recordingBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '67%',
      minHeight: 60,
      borderRadius: 30,
      borderWidth: 1,
      backgroundColor: bubbleBg,
      borderColor: bubbleBorder,
      paddingLeft: 10,
      paddingRight: 7,
      paddingVertical: 6,
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0.32 : 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
      zIndex: 2,
    },
    recordingBubbleCancelTint: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 30,
      backgroundColor: cancelTint,
    },
    recordingLeadingCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: leadingBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 9,
    },
    recordingLeadingCircleLocked: {
      backgroundColor: bubbleBg,
      borderWidth: 2,
      borderColor: c.accent,
    },
    recordingBubbleContent: {
      flex: 1,
      minHeight: 46,
      justifyContent: 'center',
      position: 'relative',
    },
    recordingLiveContent: {
      justifyContent: 'center',
    },
    recordingTimerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
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
      fontWeight: '700',
      color: c.textSecondary,
    },
    recordingWaveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    recordingWaveBar: {
      width: 3,
      borderRadius: 999,
    },
    recordingCancelOverlay: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    recordingCancelOverlayText: {
      fontSize: 16,
      fontWeight: '700',
      color: cancelText,
    },
    recordingBubbleSendButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
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
    recordingBottomCancelBar: {
      minHeight: 52 + Math.max(bottomInset, 12) + 10,
      paddingBottom: Math.max(bottomInset, 12) + 10,
      backgroundColor: bottomBarBg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: bottomBarBorder,
      marginHorizontal: -10,
      marginBottom: -(Math.max(bottomInset, 12) + 10),
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      gap: 6,
    },
    recordingBottomCancelText: {
      fontSize: 16,
      fontWeight: '700',
      color: c.textSecondary,
      letterSpacing: 0.4,
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
        </RNAnimated.View>

        <RNAnimated.View style={[styles.recordingBubble, recordingBubbleStyle]}>
          <RNAnimated.View
            pointerEvents="none"
            style={[styles.recordingBubbleCancelTint, recordingBubbleCancelTintStyle]}
          />

          <View
            style={[
              styles.recordingLeadingCircle,
              isLocked && styles.recordingLeadingCircleLocked,
            ]}
          >
            <Feather name={isLocked ? 'square' : 'mic'} size={isLocked ? 13 : 18} color={themeColors.accent} />
          </View>

          <View style={styles.recordingBubbleContent}>
            <RNAnimated.View style={[styles.recordingLiveContent, recordingLiveContentStyle]}>
              <View style={styles.recordingTimerRow}>
                <RNAnimated.View style={[styles.recordingDot, { opacity: recordingPulse }]} />
                <Text style={styles.recordingTime}>{voiceElapsedLabel}</Text>
              </View>

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
            </RNAnimated.View>

            <RNAnimated.View
              pointerEvents="none"
              style={[styles.recordingCancelOverlay, recordingCancelContentStyle]}
            >
              <Feather name="x" size={18} color={cancelAccentColor} />
              <Text style={styles.recordingCancelOverlayText}>ОТМЕНА</Text>
            </RNAnimated.View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.recordingBubbleSendButton,
              !isLocked && styles.recordingBubbleSendButtonUnlocked,
              pressed && styles.recordingBubbleSendButtonPressed,
            ]}
            onPress={onSend}
          >
            <VoiceSendIcon />
          </Pressable>
        </RNAnimated.View>
      </View>

      <Pressable style={styles.recordingBottomCancelBar} onPress={onCancel}>
        <Feather name="chevron-left" size={18} color={themeColors.iconMuted} />
        <Text style={styles.recordingBottomCancelText}>ОТМЕНА</Text>
      </Pressable>
    </View>
  );
});
