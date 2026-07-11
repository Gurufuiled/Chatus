import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { Camera } from 'expo-camera';
import {
  RTCIceCandidate,
  MediaStream as RTCMediaStream,
  MediaStreamTrack,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
  type RTCRtpSender,
  mediaDevices,
} from '@livekit/react-native-webrtc';
import {
  Alert,
  BackHandler,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, { clamp, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './AuthContext';
import { getWebRtcIceServers, resolveAvatarUrl } from '../config';
import { TelegramGlyph, TELEGRAM_CALL_GLYPHS, type CallGlyph } from '../icons/telegram';
import { SignalingService } from '../services/SignalingService';
import { VoicePlayerService } from '../services/VoicePlayerService';
import { releaseMediaAudioSession } from '../utils/releaseMediaAudioSession';
import { chatStore } from '../stores/chatStore';
import { colors, withAlpha } from '../theme/colors';

type CallPhase = 'incoming' | 'outgoing' | 'connecting' | 'active';
type CallKind = 'audio' | 'video';

type CallUiState = {
  phase: CallPhase;
  remoteUserId: string;
  displayName: string;
  avatarUrl: string | null;
  chatId?: string;
  callKind: CallKind;
  startedAt?: number;
  isMuted: boolean;
  isSpeakerOn: boolean;
  isLocalAudioReady: boolean;
  isLocalVideoReady: boolean;
  isLocalVideoEnabled: boolean;
  isRemoteVideoEnabled: boolean;
  hasRemoteVideoEverEnabled: boolean;
  localStreamUrl: string | null;
  remoteStreamUrl: string | null;
};

type StartCallOptions = {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  chatId?: string;
  callKind?: CallKind;
};

type CallContextType = {
  callState: CallUiState | null;
  startCall: (options: StartCallOptions) => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  declineIncomingCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => Promise<void>;
  toggleVideo: () => Promise<void>;
};

type PendingOffer = {
  fromUserId: string;
  sdp: RTCSessionDescriptionInit;
  callKind: CallKind;
};

const OUTGOING_TIMEOUT_MS = 30000;

/** Круглый превью своего видео (PiP): размер и отступы при перетаскивании. */
const VIDEO_PIP_WIDTH = 110;
const VIDEO_PIP_HEIGHT = 150;
const VIDEO_PIP_MARGIN = 16;

const CallContext = createContext<CallContextType | null>(null);

function formatCallDuration(startedAt?: number, now = Date.now()) {
  if (!startedAt) return 'Соединение установлено';
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function buildInitial(name: string) {
  return (name.trim()[0] || '?').toUpperCase();
}

type CallActionTone = 'neutral' | 'accent' | 'success' | 'danger' | 'disabled';

type CallControlsLayout = {
  screenHorizontalPadding: number;
  rowGap: number;
  incomingGap: number;
  incomingPaddingHorizontal: number;
  buttonGap: number;
  circleSize: number;
  prominentCircleSize: number;
  iconSize: number;
  prominentIconSize: number;
  labelFontSize: number;
};

function buildCallAudioMode(isSpeakerOn: boolean) {
  return {
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: !isSpeakerOn,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
  } satisfies Parameters<typeof Audio.setAudioModeAsync>[0];
}

function buildOfferOptions(shouldReceiveVideo: boolean) {
  return {
    offerToReceiveAudio: true,
    offerToReceiveVideo: shouldReceiveVideo,
  };
}

function getCallControlsLayout(screenWidth: number): CallControlsLayout {
  if (screenWidth <= 340) {
    return {
      screenHorizontalPadding: 14,
      rowGap: 4,
      incomingGap: 18,
      incomingPaddingHorizontal: 6,
      buttonGap: 7,
      circleSize: 50,
      prominentCircleSize: 58,
      iconSize: 20,
      prominentIconSize: 24,
      labelFontSize: 11,
    };
  }

  if (screenWidth <= 380) {
    return {
      screenHorizontalPadding: 18,
      rowGap: 6,
      incomingGap: 22,
      incomingPaddingHorizontal: 8,
      buttonGap: 8,
      circleSize: 58,
      prominentCircleSize: 66,
      iconSize: 22,
      prominentIconSize: 26,
      labelFontSize: 12,
    };
  }

  return {
    screenHorizontalPadding: 24,
    rowGap: 8,
    incomingGap: 28,
    incomingPaddingHorizontal: 12,
    buttonGap: 10,
    circleSize: 68,
    prominentCircleSize: 78,
    iconSize: 24,
    prominentIconSize: 28,
    labelFontSize: 13,
  };
}

function getStatusText(callState: CallUiState | null, nowTick: number) {
  if (!callState) return '';

  switch (callState.phase) {
    case 'incoming':
      return 'Входящий звонок';
    case 'outgoing':
      return 'Вызываем...';
    case 'connecting':
      return 'Соединяем...';
    case 'active':
      return formatCallDuration(callState.startedAt, nowTick);
    default:
      return '';
  }
}

function getPhaseCaption(callState: CallUiState | null) {
  const phase = callState?.phase;
  const isVideo = callState?.callKind === 'video';

  switch (phase) {
    case 'incoming':
      return isVideo ? 'Видеозвонок' : 'Голосовой звонок';
    case 'outgoing':
      return isVideo ? 'Ожидаем ответа на видео' : 'Ожидаем ответа';
    case 'connecting':
      return isVideo ? 'Подключаем видео' : 'Подключаем аудио';
    case 'active':
      return isVideo ? 'Видеозвонок' : 'Голосовой разговор';
    default:
      return '';
  }
}

function getCallKindFromOffer(callType: CallKind | undefined) {
  if (callType === 'video') return 'video';
  return 'audio';
}

function hasEnabledVideoTrack(stream: RTCMediaStream | null | undefined) {
  return Boolean(stream?.getVideoTracks().some((track) => track.enabled));
}

function getStreamUrl(stream: RTCMediaStream | null | undefined) {
  try {
    return stream?.toURL() ?? null;
  } catch {
    return null;
  }
}

function getActionCircleStyle(tone: CallActionTone) {
  switch (tone) {
    case 'accent':
      return styles.actionCircleAccent;
    case 'success':
      return styles.actionCircleSuccess;
    case 'danger':
      return styles.actionCircleDanger;
    case 'disabled':
      return styles.actionCircleDisabled;
    case 'neutral':
    default:
      return styles.actionCircleNeutral;
  }
}

function getActionLabelStyle(tone: CallActionTone) {
  return tone === 'disabled' ? styles.actionLabelDisabled : styles.actionLabel;
}

type CallActionButtonProps = {
  icon: CallGlyph;
  label: string;
  layout: CallControlsLayout;
  tone?: CallActionTone;
  onPress?: () => void;
  disabled?: boolean;
  prominent?: boolean;
};

const CallActionButton = React.memo(function CallActionButton({
  icon,
  label,
  layout,
  tone = 'neutral',
  onPress,
  disabled = false,
  prominent = false,
}: CallActionButtonProps) {
  const effectiveTone: CallActionTone = disabled ? 'disabled' : tone;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        prominent && styles.actionButtonProminent,
        { gap: layout.buttonGap },
        pressed && !disabled && styles.actionButtonPressed,
      ]}
    >
      <View
        style={[
          styles.actionCircle,
          prominent && styles.actionCircleProminent,
          {
            width: prominent ? layout.prominentCircleSize : layout.circleSize,
            height: prominent ? layout.prominentCircleSize : layout.circleSize,
            borderRadius: prominent
              ? layout.prominentCircleSize / 2
              : layout.circleSize / 2,
          },
          getActionCircleStyle(effectiveTone),
        ]}
      >
        <TelegramGlyph
          d={icon.d}
          fillRule={icon.fillRule}
          viewBox={icon.viewBox}
          size={prominent ? layout.prominentIconSize : layout.iconSize}
          color={effectiveTone === 'disabled' ? 'rgba(255,255,255,0.58)' : '#FFFFFF'}
        />
      </View>
      <Text
        numberOfLines={2}
        minimumFontScale={0.9}
        style={[
          styles.actionLabelBase,
          { fontSize: layout.labelFontSize, lineHeight: layout.labelFontSize + 3 },
          getActionLabelStyle(effectiveTone),
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

function resolvePeerMeta(userId: string) {
  const chats = chatStore.getState().chats;
  const chat = chats.find(
    (item) => item.chat_type === 'private' && item.members?.some((member) => member.user_id === userId)
  );

  return {
    chatId: chat?.id,
    displayName:
      chat?.local_contact_name?.trim() ||
      chat?.peer_display_name?.trim() ||
      chat?.name?.trim() ||
      'Пользователь',
    avatarUrl: resolveAvatarUrl(chat?.avatar_url),
  };
}

const CallOverlay = React.memo(function CallOverlay({
  callState,
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
  onToggleSpeaker,
  onToggleVideo,
}: {
  callState: CallUiState | null;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onToggleVideo: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (callState?.phase !== 'active' || !callState.startedAt) return undefined;
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [callState?.phase, callState?.startedAt]);
  const statusText = useMemo(() => getStatusText(callState, nowTick), [callState, nowTick]);
  const phaseCaption = getPhaseCaption(callState);
  const initial = callState ? buildInitial(callState.displayName) : '?';
  const isIncoming = callState?.phase === 'incoming';
  const showUtilityControls = Boolean(callState && !isIncoming);
  const canToggleSpeaker = Platform.OS === 'android' && showUtilityControls;
  const canToggleMute = Boolean(callState?.isLocalAudioReady && showUtilityControls);
  const canToggleVideo = Boolean(callState?.isLocalAudioReady && showUtilityControls);
  /** Удалённое видео (после первого кадра), без подмены на локальное — меньше мигания. */
  const remoteVideoStageUrl =
    callState?.callKind === 'video' &&
    callState.hasRemoteVideoEverEnabled &&
    callState.remoteStreamUrl
      ? callState.remoteStreamUrl
      : null;

  const localPreviewReady = Boolean(
    callState?.callKind === 'video' &&
      callState.isLocalVideoEnabled &&
      callState.localStreamUrl
  );

  const [pipSwapped, setPipSwapped] = useState(false);

  useEffect(() => {
    if (!localPreviewReady && pipSwapped) setPipSwapped(false);
  }, [localPreviewReady, pipSwapped]);

  useEffect(() => {
    if (!remoteVideoStageUrl && pipSwapped) setPipSwapped(false);
  }, [remoteVideoStageUrl, pipSwapped]);

  const canSwapPip = Boolean(remoteVideoStageUrl && localPreviewReady);

  const mainVideoUrl = pipSwapped
    ? localPreviewReady
      ? (callState?.localStreamUrl ?? null)
      : null
    : remoteVideoStageUrl;

  const pipVideoUrl = pipSwapped
    ? remoteVideoStageUrl
    : localPreviewReady
      ? (callState?.localStreamUrl ?? null)
      : null;

  const showPip = Boolean(
    callState?.callKind === 'video' && !isIncoming && pipVideoUrl && showUtilityControls
  );

  const showMainVideo = Boolean(mainVideoUrl);
  const showVideoStage = Boolean(callState && !isIncoming && showMainVideo);
  const mainMirror = Boolean(
    mainVideoUrl && callState?.localStreamUrl && mainVideoUrl === callState.localStreamUrl
  );
  const pipMirror = Boolean(
    pipVideoUrl && callState?.localStreamUrl && pipVideoUrl === callState.localStreamUrl
  );

  const [isUiVisible, setIsUiVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const resetHideTimer = useCallback(() => {
    clearHideTimer();
    if (callState?.phase === 'active' && callState?.callKind === 'video') {
      hideTimerRef.current = setTimeout(() => setIsUiVisible(false), 3500);
    }
  }, [callState?.phase, callState?.callKind, clearHideTimer]);

  const toggleUi = useCallback(() => {
    if (callState?.phase !== 'active' || callState?.callKind !== 'video') return;
    setIsUiVisible((visible) => {
      if (visible) {
        clearHideTimer();
        return false;
      }
      return true;
    });
  }, [callState?.phase, callState?.callKind, clearHideTimer]);

  useEffect(() => {
    if (callState?.phase === 'active' && callState?.callKind === 'video') {
      setIsUiVisible(true);
      resetHideTimer();
    } else {
      setIsUiVisible(true);
      clearHideTimer();
    }
    return clearHideTimer;
  }, [callState?.phase, callState?.callKind, resetHideTimer, clearHideTimer]);

  useEffect(() => {
    if (isUiVisible && callState?.phase === 'active' && callState?.callKind === 'video') {
      resetHideTimer();
    }
  }, [isUiVisible, callState?.phase, callState?.callKind, resetHideTimer]);

  const uiOpacity = useSharedValue(1);
  useEffect(() => {
    uiOpacity.value = withTiming(isUiVisible ? 1 : 0, { duration: 250 });
  }, [isUiVisible, uiOpacity]);

  const uiAnimatedStyle = useAnimatedStyle(() => ({
    opacity: uiOpacity.value,
  }));

  const boundsW = useSharedValue(screenWidth);
  const boundsH = useSharedValue(screenHeight);
  const minPipTop = useSharedValue(Math.max(insets.top, 20) + 40);

  useEffect(() => {
    boundsW.value = screenWidth;
    boundsH.value = screenHeight;
    minPipTop.value = Math.max(insets.top, 20) + 40;
  }, [screenWidth, screenHeight, insets.top, boundsW, boundsH, minPipTop]);

  const pipLeft = useSharedValue(Math.max(VIDEO_PIP_MARGIN, screenWidth - VIDEO_PIP_WIDTH - 18));
  const pipTop = useSharedValue(Math.max(insets.top, 20) + 72);
  const pipDragStartL = useSharedValue(0);
  const pipDragStartT = useSharedValue(0);

  useEffect(() => {
    const maxL = screenWidth - VIDEO_PIP_WIDTH - VIDEO_PIP_MARGIN;
    const maxT = screenHeight - VIDEO_PIP_HEIGHT - VIDEO_PIP_MARGIN;
    pipLeft.value = clamp(pipLeft.value, VIDEO_PIP_MARGIN, maxL);
    pipTop.value = clamp(pipTop.value, minPipTop.value, maxT);
  }, [screenWidth, screenHeight, pipLeft, pipTop, minPipTop]);

  const togglePipSwap = useCallback(() => {
    setPipSwapped((v) => (canSwapPip ? !v : v));
  }, [canSwapPip]);

  const pipGesture = useMemo(
    () =>
      Gesture.Exclusive(
        Gesture.Pan()
          .minDistance(10)
          .onBegin(() => {
            pipDragStartL.value = pipLeft.value;
            pipDragStartT.value = pipTop.value;
          })
          .onUpdate((e) => {
            const maxL = Math.max(
              VIDEO_PIP_MARGIN,
              boundsW.value - VIDEO_PIP_WIDTH - VIDEO_PIP_MARGIN
            );
            const maxT = Math.max(
              minPipTop.value + 8,
              boundsH.value - VIDEO_PIP_HEIGHT - VIDEO_PIP_MARGIN
            );
            pipLeft.value = clamp(
              pipDragStartL.value + e.translationX,
              VIDEO_PIP_MARGIN,
              maxL
            );
            pipTop.value = clamp(
              pipDragStartT.value + e.translationY,
              minPipTop.value,
              maxT
            );
          }),
        Gesture.Tap().onEnd(() => {
          runOnJS(togglePipSwap)();
        })
      ),
    [pipLeft, pipTop, pipDragStartL, pipDragStartT, boundsW, boundsH, minPipTop, togglePipSwap]
  );

  const pipAnimatedStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: pipLeft.value,
    top: pipTop.value,
    width: VIDEO_PIP_WIDTH,
    height: VIDEO_PIP_HEIGHT,
    zIndex: 24,
  }));

  const endLabel = callState?.phase === 'active' ? 'Завершить' : 'Отменить';
  const controlsLayout = useMemo(() => getCallControlsLayout(screenWidth), [screenWidth]);

  useEffect(() => {
    if (!callState) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onEnd();
      return true;
    });
    return () => sub.remove();
  }, [callState, onEnd]);

  if (!callState) {
    return null;
  }

  // Absolute fullscreen overlay (not RN Modal): native-stack on iOS often fails to
  // present a Modal from CallProvider above NavigationContainer.
  return (
    <View style={styles.overlayHost}>
      <GestureHandlerRootView style={styles.overlayRoot}>
        <View style={styles.overlay}>
          <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
          {showMainVideo ? (
            <RTCView
              streamURL={mainVideoUrl!}
              style={styles.remoteVideo}
              objectFit="cover"
              mirror={mainMirror}
              zOrder={0}
            />
          ) : (
            <>
              <View style={styles.backgroundBase} />
              <View style={styles.backgroundGlowTop} />
              <View style={styles.backgroundGlowBottom} />
            </>
          )}
          <Pressable style={StyleSheet.absoluteFill} onPress={toggleUi}>
            <Reanimated.View style={[styles.backgroundVeil, showVideoStage && styles.videoVeil, uiAnimatedStyle]} />
          </Pressable>
          <View
            pointerEvents="box-none"
            style={[
              styles.screenContent,
              {
                paddingTop: Math.max(insets.top, 20) + 22,
                paddingBottom: Math.max(insets.bottom, 20) + 18,
                paddingHorizontal: controlsLayout.screenHorizontalPadding,
              },
            ]}
          >
            <Reanimated.View
              pointerEvents={isUiVisible ? 'box-none' : 'none'}
              style={[{ flex: 1 }, uiAnimatedStyle]}
            >
              {!showVideoStage && (
                <View style={styles.topMeta} pointerEvents="box-none">
                  <Text style={styles.topMetaText}>
                    {callState.callKind === 'video' ? 'Видео' : 'Звонок'}
                  </Text>
                </View>
              )}
              <View style={[styles.centerStage, showVideoStage && styles.centerStageVideo]}>
                {!showVideoStage ? (
                  callState.avatarUrl ? (
                    <Image
                      source={{ uri: callState.avatarUrl }}
                      style={styles.avatar}
                      contentFit="cover"
                      cachePolicy="disk"
                    />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackText}>{initial}</Text>
                    </View>
                  )
                ) : null}
                <Text style={[styles.name, showVideoStage && styles.nameVideo]}>{callState.displayName}</Text>
                <Text style={[styles.status, showVideoStage && styles.statusVideo]}>{statusText}</Text>
                {!showVideoStage ? <Text style={styles.phaseCaption}>{phaseCaption}</Text> : null}
              </View>
            </Reanimated.View>
          <View style={styles.bottomDock}>
            {showUtilityControls ? (
              <View style={[styles.controlsRow, { gap: controlsLayout.rowGap }]}>
                <CallActionButton
                  icon={TELEGRAM_CALL_GLYPHS.speaker}
                  label={callState.isSpeakerOn ? 'Динамик' : 'Разговорный'}
                  layout={controlsLayout}
                  tone={callState.isSpeakerOn ? 'accent' : 'neutral'}
                  disabled={!canToggleSpeaker}
                  onPress={onToggleSpeaker}
                />
                <CallActionButton
                  icon={TELEGRAM_CALL_GLYPHS.video}
                  label="Видео"
                  layout={controlsLayout}
                  tone={callState.isLocalVideoEnabled ? 'accent' : 'neutral'}
                  disabled={!canToggleVideo}
                  onPress={onToggleVideo}
                />
                <CallActionButton
                  icon={callState.isMuted ? TELEGRAM_CALL_GLYPHS.unmute : TELEGRAM_CALL_GLYPHS.mute}
                  label={callState.isMuted ? 'Микрофон выкл.' : 'Микрофон'}
                  layout={controlsLayout}
                  tone={callState.isMuted ? 'accent' : 'neutral'}
                  disabled={!canToggleMute}
                  onPress={onToggleMute}
                />
                <CallActionButton
                  icon={TELEGRAM_CALL_GLYPHS.hangup}
                  label={endLabel}
                  layout={controlsLayout}
                  tone="danger"
                  prominent
                  onPress={onEnd}
                />
              </View>
            ) : (
              <View
                style={[
                  styles.incomingControlsRow,
                  {
                    gap: controlsLayout.incomingGap,
                    paddingHorizontal: controlsLayout.incomingPaddingHorizontal,
                  },
                ]}
              >
                <CallActionButton
                  icon={TELEGRAM_CALL_GLYPHS.hangup}
                  label="Отклонить"
                  layout={controlsLayout}
                  tone="danger"
                  prominent
                  onPress={onDecline}
                />
                <CallActionButton
                  icon={TELEGRAM_CALL_GLYPHS.phone}
                  label="Принять"
                  layout={controlsLayout}
                  tone="success"
                  prominent
                  onPress={onAccept}
                />
              </View>
            )}
          </View>
          </View>
        </View>
        {showPip ? (
          <GestureDetector gesture={pipGesture}>
            <Reanimated.View style={pipAnimatedStyle}>
              <View style={styles.videoPipShell}>
                <View style={styles.videoPipClip}>
                  <RTCView
                    streamURL={pipVideoUrl!}
                    style={styles.videoPipRtc}
                    objectFit="cover"
                    mirror={pipMirror}
                    /** zOrder 2 = setZOrderOnTop на Android — Surface уходит «над окном» и ломает круглый клип. Для PiP достаточно 1 (над удалённым zOrder 0). */
                    zOrder={1}
                  />
                </View>
                <View pointerEvents="none" style={styles.videoPipRing} />
              </View>
            </Reanimated.View>
          </GestureDetector>
        ) : null}
      </GestureHandlerRootView>
    </View>
  );
});

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [callState, setCallState] = useState<CallUiState | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<RTCMediaStream | null>(null);
  const remoteStreamRef = useRef<RTCMediaStream | null>(null);
  const localVideoSenderRef = useRef<RTCRtpSender | null>(null);
  const pendingOfferRef = useRef<PendingOffer | null>(null);
  const acceptingIncomingRef = useRef(false);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const outgoingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callStateRef = useRef<CallUiState | null>(null);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    if (!isAuthenticated) {
      SignalingService.disconnect();
      void cleanupCallSession();
      return;
    }

    SignalingService.connect();
    return () => {
      SignalingService.disconnect();
    };
  }, [isAuthenticated]);

  const clearOutgoingTimeout = useCallback(() => {
    if (outgoingTimeoutRef.current) {
      clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = null;
    }
  }, []);

  const resetAudioMode = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch {
      // Ignore reset failures.
    }
  }, []);

  const cleanupMedia = useCallback(async () => {
    const localStream = localStreamRef.current;
    const remoteStream = remoteStreamRef.current;
    const pc = pcRef.current;

    localStream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // Ignore.
      }
    });
    remoteStream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // Ignore.
      }
    });

    try {
      pc?.close();
    } catch {
      // Ignore.
    }

    localStreamRef.current = null;
    remoteStreamRef.current = null;
    localVideoSenderRef.current = null;
    pcRef.current = null;
    pendingIceCandidatesRef.current = [];
    pendingOfferRef.current = null;
    clearOutgoingTimeout();
    await resetAudioMode();
    VoicePlayerService.invalidateAudioMode();
  }, [clearOutgoingTimeout, resetAudioMode]);

  const cleanupCallSession = useCallback(async () => {
    await cleanupMedia();
    setCallState(null);
  }, [cleanupMedia]);

  const updateLocalStreamState = useCallback((nextKind?: CallKind) => {
    const localStream = localStreamRef.current;
    setCallState((state) =>
      state
        ? {
            ...state,
            callKind: nextKind ?? state.callKind,
            isLocalAudioReady: Boolean(localStream?.getAudioTracks().length),
            isLocalVideoReady: Boolean(localStream?.getVideoTracks().length),
            isLocalVideoEnabled: hasEnabledVideoTrack(localStream),
            localStreamUrl: getStreamUrl(localStream),
          }
        : state
    );
  }, []);

  const updateRemoteStreamState = useCallback((nextKind?: CallKind) => {
    const remoteStream = remoteStreamRef.current;
    const nextRemoteStreamUrl = getStreamUrl(remoteStream);
    const hasRemoteVideo = hasEnabledVideoTrack(remoteStream);
    setCallState((state) =>
      state
        ? {
            ...state,
            callKind: nextKind ?? state.callKind,
            isRemoteVideoEnabled: hasRemoteVideo,
            hasRemoteVideoEverEnabled: state.hasRemoteVideoEverEnabled || hasRemoteVideo,
            remoteStreamUrl: nextRemoteStreamUrl,
          }
        : state
    );
  }, []);

  const ensureLocalMediaStream = useCallback(
    async (withVideo: boolean) => {
      const existingStream = localStreamRef.current;
      if (existingStream) {
        if (withVideo && existingStream.getVideoTracks().length === 0) {
          const videoStream = await mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: 'user',
            },
          } as Parameters<typeof mediaDevices.getUserMedia>[0]);
          const videoTrack = videoStream.getVideoTracks()[0];

          if (videoTrack) {
            existingStream.addTrack(videoTrack);
            const pc = pcRef.current;
            if (pc) {
              localVideoSenderRef.current = pc.addTrack(videoTrack, existingStream);
            }
          }
        }

        updateLocalStreamState(withVideo ? 'video' : undefined);
        return existingStream;
      }

      const micPermission = await Camera.getMicrophonePermissionsAsync();
      if (micPermission.status !== 'granted') {
        const requested = await Camera.requestMicrophonePermissionsAsync();
        if (requested.status !== 'granted') {
          throw new Error('Microphone permission denied');
        }
      }

      await releaseMediaAudioSession();

      const desiredSpeakerOn = callStateRef.current?.isSpeakerOn ?? true;
      await Audio.setAudioModeAsync(buildCallAudioMode(desiredSpeakerOn));

      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: withVideo
          ? {
              facingMode: 'user',
            }
          : false,
      } as Parameters<typeof mediaDevices.getUserMedia>[0]);
      localStreamRef.current = stream;
      updateLocalStreamState(withVideo ? 'video' : undefined);
      return stream;
    },
    [updateLocalStreamState]
  );

  const flushPendingIceCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription || pendingIceCandidatesRef.current.length === 0) {
      return;
    }

    const candidates = [...pendingIceCandidatesRef.current];
    pendingIceCandidatesRef.current = [];

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Ignore malformed candidates.
      }
    }
  }, []);

  const createPeerConnection = useCallback(
    async (remoteUserId: string, withVideo: boolean) => {
      const localStream = await ensureLocalMediaStream(withVideo);
      const pc = new RTCPeerConnection({ iceServers: getWebRtcIceServers() });

      localStream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, localStream);
        if ((track as MediaStreamTrack).kind === 'video') {
          localVideoSenderRef.current = sender;
        }
      });

      (pc as RTCPeerConnection & {
        onicecandidate?: (event: { candidate?: RTCIceCandidate | null }) => void;
        ontrack?: (event: { streams?: RTCMediaStream[]; track: MediaStreamTrack }) => void;
        onconnectionstatechange?: () => void;
      }).onicecandidate = (event) => {
        if (event.candidate) {
          SignalingService.sendIceCandidate(remoteUserId, event.candidate.toJSON());
        }
      };

      (pc as RTCPeerConnection & {
        ontrack?: (event: { streams?: RTCMediaStream[]; track: MediaStreamTrack }) => void;
      }).ontrack = (event) => {
        const incomingStream = event.streams?.[0] ?? null;
        const existing = remoteStreamRef.current;

        if (!existing) {
          remoteStreamRef.current = incomingStream;
        } else if (incomingStream && incomingStream !== existing) {
          // Keep the same MediaStream reference across renegotiations so that
          // RTCView's streamURL stays stable and does not flicker. Merge new
          // tracks into the already-attached stream instead of swapping.
          try {
            incomingStream.getTracks().forEach((t) => {
              const already = existing
                .getTracks()
                .some((x) => (x as MediaStreamTrack).id === (t as MediaStreamTrack).id);
              if (!already) {
                existing.addTrack(t);
              }
            });
          } catch {
            // If adding fails for any reason, fall back to the new stream.
            remoteStreamRef.current = incomingStream;
          }
        } else if (!existing.getTracks().some((x) => x.id === event.track.id)) {
          try {
            existing.addTrack(event.track);
          } catch {
            // Ignore — track is already attached via streams[0].
          }
        }

        updateRemoteStreamState();
      };

      const promoteToActive = () => {
        clearOutgoingTimeout();
        setCallState((current) => {
          if (!current) return current;
          if (current.phase === 'active') return current;
          return {
            ...current,
            phase: 'active',
            startedAt: current.startedAt ?? Date.now(),
          };
        });
      };

      const shouldEndCallOnTransportFailure = () => {
        const phase = callStateRef.current?.phase;
        // Ringing / setup often flaps ICE on iOS — keep the overlay until hangup/timeout/answer path.
        return phase === 'active';
      };

      (pc as RTCPeerConnection & { onconnectionstatechange?: () => void }).onconnectionstatechange =
        () => {
          const connectionState = (pc as RTCPeerConnection & { connectionState?: string })
            .connectionState;

          if (connectionState === 'connected') {
            promoteToActive();
            return;
          }

          if (
            (connectionState === 'failed' || connectionState === 'closed') &&
            shouldEndCallOnTransportFailure()
          ) {
            void cleanupCallSession();
          }
        };

      // Some devices / react-native-webrtc versions never flip
      // `connectionState` to 'connected' reliably — rely on ICE state as the
      // authoritative signal that media can flow, so both peers agree on
      // "active" even if the PeerConnection-level event is late or missing.
      (pc as RTCPeerConnection & { oniceconnectionstatechange?: () => void }).oniceconnectionstatechange =
        () => {
          const iceState = (pc as RTCPeerConnection & { iceConnectionState?: string })
            .iceConnectionState;

          if (iceState === 'connected' || iceState === 'completed') {
            promoteToActive();
            return;
          }

          if (
            (iceState === 'failed' || iceState === 'closed') &&
            shouldEndCallOnTransportFailure()
          ) {
            void cleanupCallSession();
          }
        };

      pcRef.current = pc;
      return pc;
    },
    [cleanupCallSession, clearOutgoingTimeout, ensureLocalMediaStream, updateRemoteStreamState]
  );

  const startOutgoingTimeout = useCallback(
    (displayName: string) => {
      clearOutgoingTimeout();
      outgoingTimeoutRef.current = setTimeout(() => {
        void cleanupCallSession();
        Alert.alert('Нет ответа', `${displayName} не ответил на звонок.`);
      }, OUTGOING_TIMEOUT_MS);
    },
    [cleanupCallSession, clearOutgoingTimeout]
  );

  const sendRenegotiationOffer = useCallback(async (nextCallKind: CallKind) => {
    const pc = pcRef.current;
    const currentState = callStateRef.current;
    if (!pc || !currentState) return;

    const offer = await pc.createOffer(
      buildOfferOptions(nextCallKind === 'video' || currentState.hasRemoteVideoEverEnabled)
    );
    await pc.setLocalDescription(offer);

    const localDescription = pc.localDescription;
    if (localDescription) {
      SignalingService.sendOffer(
        currentState.remoteUserId,
        {
          type: 'offer',
          sdp: localDescription.sdp ?? '',
        },
        nextCallKind
      );
    }
  }, []);

  const stopLocalVideo = useCallback(() => {
    const localStream = localStreamRef.current;
    const pc = pcRef.current;

    localStream?.getVideoTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // Ignore.
      }
      try {
        localStream.removeTrack(track);
      } catch {
        // Ignore.
      }
    });

    if (pc && localVideoSenderRef.current) {
      try {
        pc.removeTrack(localVideoSenderRef.current);
      } catch {
        // Ignore.
      }
    }
    localVideoSenderRef.current = null;
    updateLocalStreamState();
  }, [updateLocalStreamState]);

  const startCall = useCallback(
    async ({ userId, displayName, avatarUrl, chatId, callKind = 'audio' }: StartCallOptions) => {
      if (callStateRef.current) {
        await cleanupCallSession();
      }

      if (!userId?.trim()) {
        Alert.alert('Не удалось начать звонок', 'Не найден собеседник для звонка.');
        return;
      }

      try {
        // Show outgoing UI before any async audio/WebRTC work so the caller
        // always sees the overlay immediately on iOS.
        const nextState: CallUiState = {
          phase: 'outgoing',
          remoteUserId: userId,
          displayName,
          avatarUrl: avatarUrl ? resolveAvatarUrl(avatarUrl) : null,
          chatId,
          callKind,
          isMuted: false,
          isSpeakerOn: true,
          isLocalAudioReady: false,
          isLocalVideoReady: false,
          isLocalVideoEnabled: false,
          isRemoteVideoEnabled: false,
          hasRemoteVideoEverEnabled: false,
          localStreamUrl: null,
          remoteStreamUrl: null,
        };
        callStateRef.current = nextState;
        setCallState(nextState);

        await VoicePlayerService.stop();
        await releaseMediaAudioSession();

        SignalingService.connect();
        await SignalingService.whenConnected();

        const pc = await createPeerConnection(userId, callKind === 'video');
        // Bail if user already hung up while we were setting up.
        if (callStateRef.current?.remoteUserId !== userId) {
          return;
        }

        const offer = await pc.createOffer(buildOfferOptions(callKind === 'video'));
        await pc.setLocalDescription(offer);

        const localDescription = pc.localDescription;
        if (localDescription) {
          SignalingService.sendOffer(userId, {
            type: 'offer',
            sdp: localDescription.sdp ?? '',
          }, callKind);
        }

        startOutgoingTimeout(displayName);
      } catch (error) {
        await cleanupCallSession();
        Alert.alert(
          'Не удалось начать звонок',
          error instanceof Error ? error.message : 'Попробуй еще раз чуть позже.'
        );
      }
    },
    [cleanupCallSession, createPeerConnection, startOutgoingTimeout]
  );

  const acceptIncomingCall = useCallback(async () => {
    if (acceptingIncomingRef.current) return;

    const pendingOffer = pendingOfferRef.current;
    const currentState = callStateRef.current;
    if (!pendingOffer || !currentState) {
      if (__DEV__) {
        console.warn('[CallContext] acceptIncomingCall: missing pending offer or call state');
      }
      return;
    }

    acceptingIncomingRef.current = true;

    setCallState({
      ...currentState,
      phase: 'connecting',
    });

    try {
      await VoicePlayerService.stop();
      await releaseMediaAudioSession();
      SignalingService.connect();
      await SignalingService.whenConnected();

      const pc = await createPeerConnection(
        pendingOffer.fromUserId,
        pendingOffer.callKind === 'video'
      );
      const remoteOffer = new RTCSessionDescription({
        type: pendingOffer.sdp.type ?? 'offer',
        sdp: pendingOffer.sdp.sdp ?? '',
      });

      await pc.setRemoteDescription(remoteOffer);
      await flushPendingIceCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const localDescription = pc.localDescription;
      if (localDescription) {
        SignalingService.sendAnswer(pendingOffer.fromUserId, {
          type: 'answer',
          sdp: localDescription.sdp ?? '',
        });
      }

      pendingOfferRef.current = null;
    } catch (error) {
      SignalingService.sendCallDecline(pendingOffer.fromUserId);
      await cleanupCallSession();
      Alert.alert(
        'Не удалось принять звонок',
        error instanceof Error ? error.message : 'Попробуй еще раз чуть позже.'
      );
    } finally {
      acceptingIncomingRef.current = false;
    }
  }, [cleanupCallSession, createPeerConnection, flushPendingIceCandidates]);

  const declineIncomingCall = useCallback(async () => {
    const currentState = callStateRef.current;
    if (currentState?.phase === 'incoming') {
      SignalingService.sendCallDecline(currentState.remoteUserId);
    }
    await cleanupCallSession();
  }, [cleanupCallSession]);

  const endCall = useCallback(async () => {
    const currentState = callStateRef.current;
    if (!currentState) return;

    if (currentState.phase === 'incoming') {
      SignalingService.sendCallDecline(currentState.remoteUserId);
    } else if (currentState.phase === 'outgoing') {
      SignalingService.sendCallCancel(currentState.remoteUserId);
    } else {
      SignalingService.sendCallEnd(currentState.remoteUserId);
    }

    await cleanupCallSession();
  }, [cleanupCallSession]);

  const toggleMute = useCallback(() => {
    const localStream = localStreamRef.current;
    const currentState = callStateRef.current;
    if (!localStream || !currentState || !currentState.isLocalAudioReady) return;

    const nextMuted = !currentState.isMuted;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });

    setCallState((state) => (state ? { ...state, isMuted: nextMuted } : state));
  }, []);

  const toggleSpeaker = useCallback(async () => {
    const currentState = callStateRef.current;
    if (!currentState) return;

    if (Platform.OS !== 'android') {
      Alert.alert(
        'Переключение звука недоступно',
        'В текущей реализации переключение динамика поддерживается только на Android.'
      );
      return;
    }

    const nextSpeakerOn = !currentState.isSpeakerOn;

    try {
      await Audio.setAudioModeAsync(buildCallAudioMode(nextSpeakerOn));
      setCallState((state) => (state ? { ...state, isSpeakerOn: nextSpeakerOn } : state));
    } catch {
      Alert.alert('Ошибка звука', 'Не удалось переключить текущий аудиовыход.');
    }
  }, []);

  const toggleVideo = useCallback(async () => {
    const currentState = callStateRef.current;
    if (!currentState || !pcRef.current || !currentState.isLocalAudioReady) return;

    try {
      if (currentState.isLocalVideoEnabled) {
        stopLocalVideo();
        const nextKind: CallKind =
          currentState.isRemoteVideoEnabled || currentState.hasRemoteVideoEverEnabled
            ? 'video'
            : 'audio';
        setCallState((state) => (state ? { ...state, callKind: nextKind } : state));
        await sendRenegotiationOffer(nextKind);
        return;
      }

      await ensureLocalMediaStream(true);
      setCallState((state) => (state ? { ...state, callKind: 'video' } : state));
      await sendRenegotiationOffer('video');
    } catch (error) {
      Alert.alert(
        'Не удалось включить видео',
        error instanceof Error ? error.message : 'Проверь доступ к камере и попробуй еще раз.'
      );
    }
  }, [ensureLocalMediaStream, sendRenegotiationOffer, stopLocalVideo]);

  useEffect(() => {
    const unsubscribe = SignalingService.addListener({
      onOffer: async (fromUserId, sdp, callType) => {
        const nextCallKind = getCallKindFromOffer(callType);
        const currentState = callStateRef.current;
        const currentPc = pcRef.current;
        if (currentState?.remoteUserId === fromUserId && currentPc) {
          try {
            const remoteOffer = new RTCSessionDescription({
              type: sdp.type ?? 'offer',
              sdp: sdp.sdp ?? '',
            });
            await currentPc.setRemoteDescription(remoteOffer);
            await flushPendingIceCandidates();

            const answer = await currentPc.createAnswer();
            await currentPc.setLocalDescription(answer);

            const localDescription = currentPc.localDescription;
            if (localDescription) {
              SignalingService.sendAnswer(fromUserId, {
                type: 'answer',
                sdp: localDescription.sdp ?? '',
              });
            }

            setCallState((state) =>
              state
                ? {
                    ...state,
                    callKind: nextCallKind,
                    isRemoteVideoEnabled: nextCallKind === 'video' ? state.isRemoteVideoEnabled : false,
                    hasRemoteVideoEverEnabled:
                      nextCallKind === 'video' ? state.hasRemoteVideoEverEnabled : false,
                    remoteStreamUrl: nextCallKind === 'video' ? state.remoteStreamUrl : null,
                  }
                : state
            );
          } catch {
            await cleanupCallSession();
            Alert.alert('Звонок прерван', 'Не удалось обновить медиасоединение.');
          }
          return;
        }

        if (currentState) {
          SignalingService.sendCallBusy(fromUserId);
          return;
        }

        const meta = resolvePeerMeta(fromUserId);
        pendingOfferRef.current = { fromUserId, sdp, callKind: nextCallKind };
        setCallState({
          phase: 'incoming',
          remoteUserId: fromUserId,
          displayName: meta.displayName,
          avatarUrl: meta.avatarUrl,
          chatId: meta.chatId,
          callKind: nextCallKind,
          isMuted: false,
          isSpeakerOn: true,
          isLocalAudioReady: false,
          isLocalVideoReady: false,
          isLocalVideoEnabled: false,
          isRemoteVideoEnabled: false,
          hasRemoteVideoEverEnabled: false,
          localStreamUrl: null,
          remoteStreamUrl: null,
        });
      },
      onAnswer: async (fromUserId, sdp) => {
        const currentState = callStateRef.current;
        const pc = pcRef.current;
        if (!pc || !currentState || currentState.remoteUserId !== fromUserId) return;

        try {
          const remoteAnswer = new RTCSessionDescription({
            type: sdp.type ?? 'answer',
            sdp: sdp.sdp ?? '',
          });
          await pc.setRemoteDescription(remoteAnswer);
          await flushPendingIceCandidates();
          clearOutgoingTimeout();
          setCallState((state) => {
            if (!state) return state;
            // Never demote from 'active' back to 'connecting' on renegotiation
            // answers — once media is flowing we must keep the UI stable.
            if (state.phase === 'active') return state;
            return { ...state, phase: 'connecting' };
          });
        } catch {
          await cleanupCallSession();
          Alert.alert('Звонок прерван', 'Не удалось установить соединение.');
        }
      },
      onIceCandidate: async (fromUserId, candidate) => {
        const currentState = callStateRef.current;
        if (!candidate || !currentState || currentState.remoteUserId !== fromUserId) return;

        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) {
          pendingIceCandidatesRef.current.push(candidate);
          return;
        }

        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // Ignore broken candidates.
        }
      },
      onCallCancel: async (fromUserId) => {
        const currentState = callStateRef.current;
        if (!currentState || currentState.remoteUserId !== fromUserId) return;
        await cleanupCallSession();
      },
      onCallDecline: async (fromUserId) => {
        const currentState = callStateRef.current;
        if (!currentState || currentState.remoteUserId !== fromUserId) return;
        const name = currentState.displayName;
        await cleanupCallSession();
        Alert.alert('Звонок отклонен', `${name} отклонил звонок.`);
      },
      onCallEnd: async (fromUserId) => {
        const currentState = callStateRef.current;
        if (!currentState || currentState.remoteUserId !== fromUserId) return;
        await cleanupCallSession();
      },
      onCallBusy: async (fromUserId) => {
        const currentState = callStateRef.current;
        if (!currentState || currentState.remoteUserId !== fromUserId) return;
        await cleanupCallSession();
        Alert.alert('Пользователь занят', `${currentState.displayName} уже разговаривает.`);
      },
    });

    return unsubscribe;
  }, [cleanupCallSession, clearOutgoingTimeout, flushPendingIceCandidates]);

  const contextValue = useMemo(
    () => ({
      callState,
      startCall,
      acceptIncomingCall,
      declineIncomingCall,
      endCall,
      toggleMute,
      toggleSpeaker,
      toggleVideo,
    }),
    [
      acceptIncomingCall,
      callState,
      declineIncomingCall,
      endCall,
      startCall,
      toggleMute,
      toggleSpeaker,
      toggleVideo,
    ]
  );
  return (
    <CallContext.Provider value={contextValue}>
      <View style={styles.providerRoot}>
        {children}
        {callState ? (
          Platform.OS === 'ios' ? (
            <FullWindowOverlay>
              <CallOverlay
                callState={callState}
                onAccept={() => {
                  void acceptIncomingCall();
                }}
                onDecline={() => {
                  void declineIncomingCall();
                }}
                onEnd={() => {
                  void endCall();
                }}
                onToggleMute={toggleMute}
                onToggleSpeaker={() => {
                  void toggleSpeaker();
                }}
                onToggleVideo={() => {
                  void toggleVideo();
                }}
              />
            </FullWindowOverlay>
          ) : (
            <CallOverlay
              callState={callState}
              onAccept={() => {
                void acceptIncomingCall();
              }}
              onDecline={() => {
                void declineIncomingCall();
              }}
              onEnd={() => {
                void endCall();
              }}
              onToggleMute={toggleMute}
              onToggleSpeaker={() => {
                void toggleSpeaker();
              }}
              onToggleVideo={() => {
                void toggleVideo();
              }}
            />
          )
        ) : null}
      </View>
    </CallContext.Provider>
  );
}
export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error('useCall must be used within CallProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  providerRoot: {
    flex: 1,
  },
  overlayHost: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    zIndex: 10000,
    elevation: 10000,
  },
  overlayRoot: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: '#07111E',
  },
  backgroundBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#07111E',
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -120,
    right: -60,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: withAlpha(colors.accent, 0.36),
    transform: [{ scaleX: 1.15 }],
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: -180,
    left: -100,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: 'rgba(123, 92, 255, 0.28)',
  },
  backgroundVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 14, 24, 0.68)',
  },
  videoVeil: {
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050A12',
  },
  videoPipShell: {
    width: VIDEO_PIP_WIDTH,
    height: VIDEO_PIP_HEIGHT,
    borderRadius: 12,
    backgroundColor: '#101827',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
  },
  videoPipClip: {
    width: VIDEO_PIP_WIDTH,
    height: VIDEO_PIP_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#101827',
  },
  videoPipRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'transparent',
  },
  videoPipRtc: {
    width: VIDEO_PIP_WIDTH,
    height: VIDEO_PIP_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
  },
  screenContent: {
    flex: 1,
  },
  topMeta: {
    alignSelf: 'center',
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  topMetaText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: 'rgba(255,255,255,0.74)',
  },
  centerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerStageVideo: {
    flex: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 10,
  },
  avatar: {
    width: 136,
    height: 136,
    borderRadius: 68,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  avatarFallback: {
    width: 136,
    height: 136,
    borderRadius: 68,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.accent, 0.92),
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  avatarFallbackText: {
    fontSize: 46,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  name: {
    marginTop: 24,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  nameVideo: {
    marginTop: 0,
    fontSize: 22,
    lineHeight: 26,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  status: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
  },
  statusVideo: {
    marginTop: 4,
    fontSize: 16,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  phaseCaption: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.56)',
    textAlign: 'center',
  },
  bottomDock: {
    width: '100%',
    paddingBottom: 6,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  incomingControlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  actionButton: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 2,
  },
  actionButtonProminent: {
    minWidth: 0,
  },
  actionButtonPressed: {
    opacity: 0.84,
  },
  actionCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  actionCircleProminent: {},
  actionCircleNeutral: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  actionCircleAccent: {
    backgroundColor: withAlpha(colors.accent, 0.96),
    borderColor: withAlpha(colors.accent, 0.24),
  },
  actionCircleSuccess: {
    backgroundColor: '#34C759',
    borderColor: 'rgba(52,199,89,0.28)',
  },
  actionCircleDanger: {
    backgroundColor: '#F05757',
    borderColor: 'rgba(240,87,87,0.24)',
  },
  actionCircleDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.04)',
  },
  actionLabelBase: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  actionLabel: {
    color: '#FFFFFF',
  },
  actionLabelDisabled: {
    color: 'rgba(255,255,255,0.5)',
  },
});

