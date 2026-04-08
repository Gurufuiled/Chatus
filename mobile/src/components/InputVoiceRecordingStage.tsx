import React from 'react';
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
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import { VoiceRecorderService } from '../services/VoiceRecorderService';
import { colors } from '../theme/colors';

const LIVE_WAVEFORM_BAR_COUNT = 28;
const LIVE_WAVEFORM_FALLBACK = Array(LIVE_WAVEFORM_BAR_COUNT).fill(0.08);

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
      ])
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
        const normalized = Math.max(0, Math.min(1, value ?? 0.08));
        return 4 + Math.pow(normalized, 0.82) * 18;
      }),
    [liveWaveform]
  );

  return (
    <View style={styles.recordingStage}>
      {voiceTouchTracking && !isLocked ? (
        <View style={styles.recordingGestureLayer} {...panHandlers} />
      ) : null}

      <View style={styles.recordingTopLayer}>
        <RNAnimated.View style={[styles.recordingLockBubble, recordingLockStyle]}>
          <RNAnimated.View style={[styles.recordingLockIcon, recordingUnlockIconStyle]}>
            <Feather name="unlock" size={18} color="#5A9BFF" />
          </RNAnimated.View>
          <RNAnimated.View style={[styles.recordingLockIcon, recordingLockIconStyle]}>
            <Feather name="lock" size={18} color="#3B82F6" />
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
            <Feather
              name={isLocked ? 'square' : 'mic'}
              size={isLocked ? 13 : 18}
              color={colors.accent}
            />
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
                        backgroundColor: height >= 14 ? '#5FA6FF' : '#BFD9FF',
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
              <Feather name="x" size={18} color="#F16E6E" />
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
        <Feather name="chevron-left" size={18} color="#667085" />
        <Text style={styles.recordingBottomCancelText}>ОТМЕНА</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
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
    backgroundColor: '#FFFFFF',
    borderColor: '#CFE0FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
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
    backgroundColor: '#FFFFFF',
    borderColor: '#D7E5FF',
    paddingLeft: 10,
    paddingRight: 7,
    paddingVertical: 6,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    zIndex: 2,
  },
  recordingBubbleCancelTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    backgroundColor: '#FFF1F1',
  },
  recordingLeadingCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  recordingLeadingCircleLocked: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#5FA6FF',
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
    color: '#5B6472',
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
    color: '#F16E6E',
  },
  recordingBubbleSendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5BA3FF',
    marginLeft: 6,
    shadowColor: '#245DA8',
    shadowOpacity: 0.22,
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
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF5',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 6,
  },
  recordingBottomCancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#667085',
    letterSpacing: 0.4,
  },
});
