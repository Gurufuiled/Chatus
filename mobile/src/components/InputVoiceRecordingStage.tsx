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
import { composerPresentation } from '../presentation';

const LIVE_WAVEFORM_BAR_COUNT = 28;
const LIVE_WAVEFORM_FALLBACK = Array(LIVE_WAVEFORM_BAR_COUNT).fill(0.06);

type AnimatedStyle = React.ComponentProps<typeof RNAnimated.View>['style'];
type PanHandlers = ReturnType<typeof PanResponder.create>['panHandlers'];

type InputVoiceRecordingStageProps = {
  recordingStartedAtMs: number;
  attachedToReply?: boolean;
  isLocked: boolean;
  voiceTouchTracking: boolean;
  panHandlers: PanHandlers;
  recordingBubbleStyle: AnimatedStyle;
  recordingBubbleCancelTintStyle: AnimatedStyle;
  recordingLiveContentStyle: AnimatedStyle;
  recordingCancelContentStyle: AnimatedStyle;
  onCancel: () => void;
  onSend: () => void;
};

function VoiceSendIcon() {
  return <Feather name="arrow-up" size={20} color="#FFFFFF" />;
}

function createVoiceRecordingStyles(c: ThemeColors, isDark: boolean) {
  const bubbleBg = isDark ? '#202B36' : '#FFFFFF';
  const bubbleBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
  const cancelTint = isDark ? 'rgba(255, 83, 83, 0.14)' : 'rgba(255,83,83,0.10)';
  const cancelText = isDark ? '#F7F8FA' : '#E05252';
  const mutedCancelText = isDark ? 'rgba(247,248,250,0.82)' : 'rgba(35,47,62,0.72)';

  return StyleSheet.create({
    // Высота панели записи ровно равна высоте обычной панели ввода. Раньше кнопка записи (58) была выше
    // панели (54): в момент старта композер «подрастал» на 4px, список чата сжимался мгновенно, а
    // анимация дока двигала только сам док — отсюда рывок. Кнопка и ореол просто выступают за границы.
    recordingStage: {
      position: 'relative',
      alignSelf: 'stretch',
      height: composerPresentation.shellMinHeight,
      zIndex: 5,
      overflow: 'visible',
    },
    recordingGestureLayer: {
      ...StyleSheet.absoluteFillObject,
      right: 0,
      zIndex: 8,
    },
    recordingTopLayer: {
      height: composerPresentation.shellMinHeight,
      justifyContent: 'center',
      overflow: 'visible',
    },
    recordingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: composerPresentation.shellMinHeight,
      position: 'relative',
    },
    recordingBubble: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 14,
      paddingRight: 40,
      paddingVertical: 0,
      height: composerPresentation.shellMinHeight,
      backgroundColor: bubbleBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: bubbleBorder,
      borderRadius: 26,
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0.28 : 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
      marginRight: -28,
    },
    recordingBubbleCancelTint: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 26,
      backgroundColor: cancelTint,
    },
    recordingBubbleAttached: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderRadius: 0,
      shadowOpacity: 0,
      elevation: 0,
    },
    recordingLiveContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
    },
    recordingLiveContentLocked: {
      flex: 0,
      flexGrow: 0,
    },
    recordingTimerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      width: 66,
      flexShrink: 0,
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
      fontWeight: '600',
      color: c.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    recordingWaveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      flex: 1,
      minWidth: 24,
      overflow: 'hidden',
    },
    recordingWaveBar: {
      width: 3,
      borderRadius: 999,
    },
    recordingSlideHint: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      minWidth: 0,
      paddingHorizontal: 4,
    },
    recordingSlideHintChevron: {
      marginRight: 3,
    },
    recordingSlideHintText: {
      fontSize: 15,
      fontWeight: '600',
      color: mutedCancelText,
      flexShrink: 1,
    },
    recordingCancelOverlay: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    recordingCancelOverlayText: {
      fontSize: 16,
      fontWeight: '700',
      color: cancelText,
      letterSpacing: 0.2,
    },
    recordingActionButton: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
      zIndex: 3,
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0.44 : 0.24,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 6,
    },
    recordingActionButtonPressed: {
      opacity: 0.88,
    },
    recordingActionHalo: {
      position: 'absolute',
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: withAlpha(c.accent, isDark ? 0.2 : 0.16),
    },
    recordingBubbleDeleteButton: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 2,
    },
  });
}

export const InputVoiceRecordingStage = React.memo(function InputVoiceRecordingStage({
  recordingStartedAtMs,
  attachedToReply = false,
  isLocked,
  voiceTouchTracking,
  panHandlers,
  recordingBubbleStyle,
  recordingBubbleCancelTintStyle,
  recordingLiveContentStyle,
  recordingCancelContentStyle,
  onCancel,
  onSend,
}: InputVoiceRecordingStageProps) {
  const { colors: themeColors, resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const styles = useMemo(
    () => createVoiceRecordingStyles(themeColors, isDark),
    [themeColors, isDark],
  );

  const waveColors = useMemo(
    () => ({
      peak: themeColors.accent,
      quiet: isDark ? withAlpha(themeColors.accent, 0.38) : '#BFD9FF',
    }),
    [isDark, themeColors.accent],
  );

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

  const actionPulseStyle = React.useMemo(
    () => ({
      opacity: recordingPulse.interpolate({
        inputRange: [0.25, 1],
        outputRange: [0.06, 0.34],
      }),
      transform: [
        {
          scale: recordingPulse.interpolate({
            inputRange: [0.25, 1],
            outputRange: [1.2, 0.92],
          }),
        },
      ] as ViewStyle['transform'],
    }),
    [recordingPulse],
  );

  return (
    <View testID="voice-recording-stage" style={styles.recordingStage}>
      {voiceTouchTracking && !isLocked ? (
        <View style={styles.recordingGestureLayer} {...panHandlers} />
      ) : null}

      <View style={styles.recordingTopLayer}>
        <View style={styles.recordingRow}>
          <RNAnimated.View
            style={[
              styles.recordingBubble,
              attachedToReply && styles.recordingBubbleAttached,
            ]}
          >
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
                <Feather name="trash-2" size={23} color={themeColors.iconMuted} />
              </Pressable>
            ) : null}

            <RNAnimated.View
              style={[
                styles.recordingLiveContent,
                isLocked && styles.recordingLiveContentLocked,
                recordingLiveContentStyle,
              ]}
            >
              <View style={styles.recordingTimerRow}>
                <RNAnimated.View style={[styles.recordingDot, { opacity: recordingPulse }]} />
                <Text style={styles.recordingTime}>{voiceElapsedLabel}</Text>
              </View>

              {!isLocked ? (
                <View style={styles.recordingSlideHint}>
                  <Feather
                    name="chevron-left"
                    size={18}
                    color={themeColors.iconMuted}
                    style={styles.recordingSlideHintChevron}
                  />
                  <Text style={styles.recordingSlideHintText} numberOfLines={1}>
                    Влево — отмена
                  </Text>
                </View>
              ) : null}
            </RNAnimated.View>

            {isLocked ? (
              <RNAnimated.View
                testID="voice-recording-waveform"
                style={[styles.recordingWaveRow, recordingLiveContentStyle]}
                pointerEvents="none"
              >
                {liveBarHeights.map((height, index) => (
                  <View
                    key={`recording-bar-${index}`}
                    style={[
                      styles.recordingWaveBar,
                      {
                        height,
                        opacity: 0.34 + (index / Math.max(liveBarHeights.length - 1, 1)) * 0.44,
                        backgroundColor: height >= 14 ? waveColors.peak : waveColors.quiet,
                      },
                    ]}
                  />
                ))}
              </RNAnimated.View>
            ) : null}

            <RNAnimated.View
              pointerEvents="none"
              style={[styles.recordingCancelOverlay, recordingCancelContentStyle]}
            >
              <Text style={styles.recordingCancelOverlayText}>ОТМЕНА</Text>
            </RNAnimated.View>
          </RNAnimated.View>

          {isLocked ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send voice message"
              style={({ pressed }) => [
                styles.recordingActionButton,
                pressed && styles.recordingActionButtonPressed,
              ]}
              onPress={onSend}
            >
              <VoiceSendIcon />
            </Pressable>
          ) : (
            <RNAnimated.View
              pointerEvents="none"
              style={[styles.recordingActionButton, recordingBubbleStyle]}
            >
              <RNAnimated.View style={[styles.recordingActionHalo, actionPulseStyle]} />
              <Feather name="mic" size={26} color="#FFFFFF" />
            </RNAnimated.View>
          )}
        </View>
      </View>
    </View>
  );
});
