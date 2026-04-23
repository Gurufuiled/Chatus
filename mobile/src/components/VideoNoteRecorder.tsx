import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import Feather from '@expo/vector-icons/Feather';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  VideoNoteCameraRef,
  VideoNoteRecordingResult,
} from '../services/VideoNoteRecorderService';
import {
  MAX_DURATION_SECONDS,
  VideoNoteRecorderService,
} from '../services/VideoNoteRecorderService';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CIRCLE_SIZE = Math.min(SCREEN_WIDTH - 44, 320);
const CIRCLE_RADIUS = CIRCLE_SIZE / 2;
const MAX_DURATION_MS = MAX_DURATION_SECONDS * 1000;
const VIDEO_NOTE_BITRATE = 850_000;

function formatTimer(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSec = Math.floor(safeMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export interface VideoNoteRecorderProps {
  visible: boolean;
  onComplete: (result: VideoNoteRecordingResult) => void | Promise<void>;
  onCancel: () => void;
  blurTargetRef?: React.RefObject<View | null>;
}

export function VideoNoteRecorder({
  visible,
  onComplete,
  onCancel,
  blurTargetRef,
}: VideoNoteRecorderProps) {
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [isPreparing, setIsPreparing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [cameraSessionKey, setCameraSessionKey] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimestampRef = useRef(0);
  const startAttemptedRef = useRef(false);
  const finishingRef = useRef(false);
  const cancelledRef = useRef(false);

  const hasCameraPermission = cameraPermission?.granted === true;
  const hasMicrophonePermission = microphonePermission?.granted === true;
  const hasAllPermissions = hasCameraPermission && hasMicrophonePermission;
  const canFlipCamera = !isPreparing && !isRecording;

  const setCameraNodeRef = useCallback((instance: VideoNoteCameraRef | null) => {
    VideoNoteRecorderService.setCameraRef(instance);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsedMs(0);
    startTimestampRef.current = 0;
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    startTimestampRef.current = Date.now();
    setElapsedMs(0);
    timerRef.current = setInterval(() => {
      const nextElapsed = Math.min(Date.now() - startTimestampRef.current, MAX_DURATION_MS);
      setElapsedMs(nextElapsed);
      if (nextElapsed >= MAX_DURATION_MS && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, 100);
  }, []);

  const ensurePermissions = useCallback(async (): Promise<boolean> => {
    if (!hasCameraPermission) {
      const nextCameraPermission = await requestCameraPermission();
      if (!nextCameraPermission.granted) return false;
    }

    if (!hasMicrophonePermission) {
      const nextMicrophonePermission = await requestMicrophonePermission();
      if (!nextMicrophonePermission.granted) return false;
    }

    return true;
  }, [
    hasCameraPermission,
    hasMicrophonePermission,
    requestCameraPermission,
    requestMicrophonePermission,
  ]);

  const stopRecordingSilently = useCallback(async () => {
    if (!VideoNoteRecorderService.isRecording()) return;

    try {
      await VideoNoteRecorderService.stopRecording();
    } catch {
      // Recording can already be stopping while modal is dismissed.
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (startAttemptedRef.current || !cameraReady || !hasAllPermissions) {
      return;
    }

    startAttemptedRef.current = true;
    setIsPreparing(true);

    try {
      await VideoNoteRecorderService.startRecording();
      if (cancelledRef.current) {
        await stopRecordingSilently();
        return;
      }
      setIsRecording(true);
      startTimer();
    } catch (err) {
      if (__DEV__) {
        console.warn('[VideoNoteRecorder] start recording error:', err);
      }
      Alert.alert('Ошибка', 'Не удалось начать запись видеокружка.');
      onCancel();
    } finally {
      setIsPreparing(false);
    }
  }, [cameraReady, hasAllPermissions, onCancel, startTimer, stopRecordingSilently]);

  const finalizeRecording = useCallback(
    async (discard: boolean) => {
      if (finishingRef.current) {
        return;
      }

      cancelledRef.current = discard;
      finishingRef.current = true;
      setIsPreparing(true);

      try {
        const result = await VideoNoteRecorderService.stopRecording();
        stopTimer();
        setIsRecording(false);

        if (discard) {
          onCancel();
          return;
        }

        await onComplete(result);
      } catch (err) {
        stopTimer();
        setIsRecording(false);
        if (discard) {
          onCancel();
          return;
        }
        if (__DEV__) {
          console.warn('[VideoNoteRecorder] stop recording error:', err);
        }
        Alert.alert('Ошибка', 'Не удалось сохранить видеокружок.');
      } finally {
        finishingRef.current = false;
        setIsPreparing(false);
      }
    },
    [onCancel, onComplete, stopTimer]
  );

  const handleCancel = useCallback(() => {
    if (!visible) return;

    if (VideoNoteRecorderService.isRecording()) {
      void finalizeRecording(true);
      return;
    }

    cancelledRef.current = true;
    stopTimer();
    onCancel();
  }, [finalizeRecording, onCancel, stopTimer, visible]);

  const handleSend = useCallback(() => {
    if (!VideoNoteRecorderService.isRecording()) return;
    void finalizeRecording(false);
  }, [finalizeRecording]);

  const handleFlipCamera = useCallback(() => {
    // expo-camera stops the current recording when facing changes.
    // Block camera flips while the note is recording/preparing to avoid truncated output.
    if (!canFlipCamera) return;
    setFacing((current) => (current === 'front' ? 'back' : 'front'));
  }, [canFlipCamera]);

  useEffect(() => {
    if (!visible) {
      cancelledRef.current = false;
      startAttemptedRef.current = false;
      setCameraReady(false);
      setIsPreparing(false);
      setIsRecording(false);
      stopTimer();
      VideoNoteRecorderService.setCameraRef(null);
      return;
    }

    cancelledRef.current = false;
    startAttemptedRef.current = false;
    setCameraSessionKey((current) => current + 1);
    setFacing('front');
    setCameraReady(false);
    setIsPreparing(true);
    setIsRecording(false);
    setElapsedMs(0);

    void ensurePermissions().then((granted) => {
      if (!granted) {
        setIsPreparing(false);
      }
    });
  }, [ensurePermissions, stopTimer, visible]);

  useEffect(() => {
    if (!visible || !cameraReady || !hasAllPermissions || isRecording || finishingRef.current) {
      return;
    }

    void startRecording();
  }, [cameraReady, hasAllPermissions, isRecording, startRecording, visible]);

  useEffect(() => {
    if (!visible || !isRecording || elapsedMs < MAX_DURATION_MS) {
      return;
    }

    void finalizeRecording(false);
  }, [elapsedMs, finalizeRecording, isRecording, visible]);

  useEffect(() => {
    return () => {
      stopTimer();
      VideoNoteRecorderService.setCameraRef(null);
    };
  }, [stopTimer]);

  const circleContent = useMemo(() => {
    if (!hasAllPermissions) {
      return (
        <View style={styles.permissionSurface}>
          <Feather name="camera" size={28} color="#ECF8FF" />
          <Text style={styles.permissionTitle}>Нужен доступ к камере и микрофону</Text>
          <Text style={styles.permissionText}>
            Разреши доступ, и свайп вверх сразу будет открывать запись видеокружка.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Разрешить доступ"
            onPress={() => {
              void ensurePermissions();
            }}
            style={({ pressed }) => [
              styles.permissionButton,
              pressed && styles.permissionButtonPressed,
            ]}
          >
            <Text style={styles.permissionButtonLabel}>Разрешить</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.cameraMask}>
        <CameraView
          key={`video-note-camera-${cameraSessionKey}-${facing}`}
          ref={setCameraNodeRef}
          style={styles.camera}
          facing={facing}
          mode="video"
          mirror={facing === 'front'}
          zoom={0}
          ratio={Platform.OS === 'android' ? '1:1' : undefined}
          videoQuality="480p"
          videoBitrate={VIDEO_NOTE_BITRATE}
          onCameraReady={() => {
            setCameraReady(true);
          }}
        />
      </View>
    );
  }, [ensurePermissions, facing, hasAllPermissions, setCameraNodeRef]);

  const blurProps =
    blurTargetRef && blurTargetRef.current
      ? { blurTarget: blurTargetRef }
      : undefined;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <View style={styles.modalRoot}>
        <BlurView
          intensity={100}
          tint="default"
          blurMethod="dimezisBlurView"
          blurReductionFactor={1}
          {...blurProps}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.backdropWash} />

        <View
          style={[
            styles.content,
            {
              paddingTop: Math.max(insets.top + 18, 24),
              paddingBottom: Math.max(insets.bottom + 18, 22),
            },
          ]}
        >
          <View style={styles.stageWrap}>
            <View style={styles.circleShell}>
              {circleContent}
              {isPreparing ? (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color="#FFFFFF" />
                </View>
              ) : null}
            </View>

            <View style={styles.rightRail}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Переключить камеру"
                disabled={!canFlipCamera}
                onPress={handleFlipCamera}
                style={({ pressed }) => [
                  styles.railButton,
                  !canFlipCamera && styles.railButtonDisabled,
                  pressed && canFlipCamera && styles.railButtonPressed,
                ]}
              >
                <Feather
                  name="refresh-cw"
                  size={18}
                  color={canFlipCamera ? '#17577C' : 'rgba(23,87,124,0.42)'}
                />
              </Pressable>
              <View style={styles.railBadge}>
                <Text style={styles.railBadgeLabel}>VIDEO</Text>
              </View>
            </View>
          </View>

          <View style={styles.bottomBar}>
            <View style={styles.controlsBarWrap}>
              <BlurView
                intensity={96}
                tint="default"
                blurMethod="dimezisBlurView"
                blurReductionFactor={1}
                {...blurProps}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.controlsBarWash} />
              <View pointerEvents="none" style={styles.controlsBarTintLeft} />
              <View pointerEvents="none" style={styles.controlsBarTintRight} />
              <View style={styles.controlsBarContent}>
                <View style={styles.timerPill}>
                  <View style={styles.recordDot} />
                  <Text style={styles.timerText}>{formatTimer(elapsedMs)}</Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Отменить запись"
                  onPress={handleCancel}
                  style={({ pressed }) => [
                    styles.cancelAction,
                    pressed && styles.cancelActionPressed,
                  ]}
                >
                  <Text style={styles.cancelActionLabel}>Отмена</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Отправить видеокружок"
              disabled={!isRecording || isPreparing}
              onPress={handleSend}
              style={({ pressed }) => [
                styles.sendButton,
                (!isRecording || isPreparing) && styles.sendButtonDisabled,
                pressed && isRecording && !isPreparing && styles.sendButtonPressed,
              ]}
            >
              <Feather name="arrow-up" size={28} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  backdropWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  stageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleShell: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#0E1116',
    shadowColor: '#0F172A',
    shadowOpacity: 0.22,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 16 },
    elevation: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CIRCLE_RADIUS,
  },
  cameraMask: {
    flex: 1,
    borderRadius: CIRCLE_RADIUS,
    overflow: 'hidden',
  },
  circleProgressPill: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    width: 58,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.62)',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.2)',
  },
  rightRail: {
    position: 'absolute',
    right: 8,
    bottom: 34,
    gap: 10,
    alignItems: 'center',
  },
  railButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
  },
  railButtonPressed: {
    opacity: 0.82,
  },
  railButtonDisabled: {
    opacity: 0.52,
  },
  railBadge: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
  },
  railBadgeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#17577C',
  },
  bottomBar: {
    position: 'relative',
    minHeight: 78,
    justifyContent: 'center',
    marginBottom: 2,
  },
  controlsBarWrap: {
    height: 42,
    marginRight: 24,
    borderRadius: 21,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.52)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  controlsBarWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  controlsBarTintLeft: {
    position: 'absolute',
    left: -18,
    top: -6,
    bottom: -6,
    width: '44%',
    borderRadius: 40,
    backgroundColor: 'rgba(246, 177, 232, 0.22)',
  },
  controlsBarTintRight: {
    position: 'absolute',
    right: -22,
    top: -8,
    bottom: -8,
    width: '48%',
    borderRadius: 40,
    backgroundColor: 'rgba(146, 241, 238, 0.2)',
  },
  controlsBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 10,
    paddingRight: 82,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF4D6D',
  },
  timerText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: '#283547',
  },
  cancelAction: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  cancelActionPressed: {
    opacity: 0.7,
  },
  cancelActionLabel: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '500',
    color: '#5676FF',
  },
  sendButton: {
    position: 'absolute',
    right: -8,
    top: -9,
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5D72FF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    shadowColor: '#5D72FF',
    shadowOpacity: 0.22,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  sendButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  permissionSurface: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    backgroundColor: 'rgba(19, 28, 38, 0.92)',
  },
  permissionTitle: {
    marginTop: 18,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    textAlign: 'center',
    color: '#FFFFFF',
  },
  permissionText: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: 'rgba(236, 248, 255, 0.8)',
  },
  permissionButton: {
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#5D72FF',
  },
  permissionButtonPressed: {
    opacity: 0.82,
  },
  permissionButtonLabel: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
