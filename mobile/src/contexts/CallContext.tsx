import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import { Audio } from 'expo-av';
import {
  RTCIceCandidate,
  MediaStream as RTCMediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './AuthContext';
import { resolveAvatarUrl } from '../config';
import { SignalingService } from '../services/SignalingService';
import { VoicePlayerService } from '../services/VoicePlayerService';
import { chatStore } from '../stores/chatStore';
import { colors } from '../theme/colors';

type CallPhase = 'incoming' | 'outgoing' | 'connecting' | 'active';

type CallUiState = {
  phase: CallPhase;
  remoteUserId: string;
  displayName: string;
  avatarUrl: string | null;
  chatId?: string;
  startedAt?: number;
  isMuted: boolean;
};

type StartCallOptions = {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  chatId?: string;
};

type CallContextType = {
  callState: CallUiState | null;
  startCall: (options: StartCallOptions) => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  declineIncomingCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
};

type PendingOffer = {
  fromUserId: string;
  sdp: RTCSessionDescriptionInit;
};

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const OUTGOING_TIMEOUT_MS = 30000;

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

function resolvePeerMeta(userId: string) {
  const chats = chatStore.getState().chats;
  const chat = chats.find(
    (item) => item.chat_type === 'private' && item.members?.some((member) => member.user_id === userId)
  );

  return {
    chatId: chat?.id,
    displayName: chat?.peer_display_name?.trim() || chat?.name?.trim() || 'Пользователь',
    avatarUrl: resolveAvatarUrl(chat?.avatar_url),
  };
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const [callState, setCallState] = useState<CallUiState | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<RTCMediaStream | null>(null);
  const remoteStreamRef = useRef<RTCMediaStream | null>(null);
  const pendingOfferRef = useRef<PendingOffer | null>(null);
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

  useEffect(() => {
    if (callState?.phase !== 'active' || !callState.startedAt) return undefined;

    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [callState?.phase, callState?.startedAt]);

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
    pcRef.current = null;
    pendingIceCandidatesRef.current = [];
    pendingOfferRef.current = null;
    clearOutgoingTimeout();
    await resetAudioMode();
  }, [clearOutgoingTimeout, resetAudioMode]);

  const cleanupCallSession = useCallback(async () => {
    await cleanupMedia();
    setCallState(null);
  }, [cleanupMedia]);

  const ensureLocalAudioStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;

    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Microphone permission denied');
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    localStreamRef.current = stream;
    return stream;
  }, []);

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
    async (remoteUserId: string) => {
      const localStream = await ensureLocalAudioStream();
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
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
        remoteStreamRef.current = event.streams?.[0] ?? null;
        setCallState((current) =>
          current
            ? {
                ...current,
                phase: 'active',
                startedAt: current.startedAt ?? Date.now(),
              }
            : current
        );
      };

      (pc as RTCPeerConnection & { onconnectionstatechange?: () => void }).onconnectionstatechange =
        () => {
          const connectionState = (pc as RTCPeerConnection & { connectionState?: string })
            .connectionState;

          if (connectionState === 'connected') {
            clearOutgoingTimeout();
            setCallState((current) =>
              current
                ? {
                    ...current,
                    phase: 'active',
                    startedAt: current.startedAt ?? Date.now(),
                  }
                : current
            );
            return;
          }

          if (
            connectionState === 'failed' ||
            connectionState === 'disconnected' ||
            connectionState === 'closed'
          ) {
            void cleanupCallSession();
          }
        };

      pcRef.current = pc;
      return pc;
    },
    [cleanupCallSession, clearOutgoingTimeout, ensureLocalAudioStream]
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

  const startCall = useCallback(
    async ({ userId, displayName, avatarUrl, chatId }: StartCallOptions) => {
      if (callStateRef.current) return;

      try {
        await VoicePlayerService.stop();
        await SignalingService.whenConnected();

        setCallState({
          phase: 'outgoing',
          remoteUserId: userId,
          displayName,
          avatarUrl: avatarUrl ? resolveAvatarUrl(avatarUrl) : null,
          chatId,
          isMuted: false,
        });

        const pc = await createPeerConnection(userId);
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);

        const localDescription = pc.localDescription;
        if (localDescription) {
          SignalingService.sendOffer(userId, {
            type: 'offer',
            sdp: localDescription.sdp ?? '',
          });
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
    const pendingOffer = pendingOfferRef.current;
    const currentState = callStateRef.current;
    if (!pendingOffer || !currentState) return;

    try {
      await VoicePlayerService.stop();
      await SignalingService.whenConnected();

      setCallState({
        ...currentState,
        phase: 'connecting',
      });

      const pc = await createPeerConnection(pendingOffer.fromUserId);
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
      const targetUserId = pendingOfferRef.current?.fromUserId;
      if (targetUserId) {
        SignalingService.sendCallDecline(targetUserId);
      }
      await cleanupCallSession();
      Alert.alert(
        'Не удалось принять звонок',
        error instanceof Error ? error.message : 'Попробуй еще раз чуть позже.'
      );
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
    if (!localStream || !currentState) return;

    const nextMuted = !currentState.isMuted;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });

    setCallState((state) => (state ? { ...state, isMuted: nextMuted } : state));
  }, []);

  useEffect(() => {
    const unsubscribe = SignalingService.addListener({
      onOffer: (fromUserId, sdp) => {
        const currentState = callStateRef.current;
        if (currentState) {
          SignalingService.sendCallBusy(fromUserId);
          return;
        }

        const meta = resolvePeerMeta(fromUserId);
        pendingOfferRef.current = { fromUserId, sdp };
        setCallState({
          phase: 'incoming',
          remoteUserId: fromUserId,
          displayName: meta.displayName,
          avatarUrl: meta.avatarUrl,
          chatId: meta.chatId,
          isMuted: false,
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
          setCallState((state) =>
            state ? { ...state, phase: 'connecting' } : state
          );
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

  const statusText = useMemo(() => {
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
  }, [callState, nowTick]);

  const initial = callState ? buildInitial(callState.displayName) : '?';

  return (
    <CallContext.Provider
      value={{
        callState,
        startCall,
        acceptIncomingCall,
        declineIncomingCall,
        endCall,
        toggleMute,
      }}
    >
      {children}

      <Modal
        visible={callState != null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          void endCall();
        }}
      >
        <View style={styles.overlay}>
          <View style={[styles.overlayCard, { paddingTop: Math.max(insets.top, 20) + 18 }]}>
            <View style={styles.heroSpacer} />

            {callState?.avatarUrl ? (
              <Image source={{ uri: callState.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>{initial}</Text>
              </View>
            )}

            <Text style={styles.name}>{callState?.displayName ?? ''}</Text>
            <Text style={styles.status}>{statusText}</Text>

            <View style={styles.controlsRow}>
              {callState?.phase === 'incoming' ? (
                <>
                  <Pressable
                    onPress={() => {
                      void declineIncomingCall();
                    }}
                    style={({ pressed }) => [
                      styles.controlButton,
                      styles.controlButtonDanger,
                      pressed && styles.controlButtonPressed,
                    ]}
                  >
                    <Feather name="phone-off" size={22} color="#FFFFFF" />
                    <Text style={styles.controlLabelLight}>Отклонить</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      void acceptIncomingCall();
                    }}
                    style={({ pressed }) => [
                      styles.controlButton,
                      styles.controlButtonSuccess,
                      pressed && styles.controlButtonPressed,
                    ]}
                  >
                    <Feather name="phone-call" size={22} color="#FFFFFF" />
                    <Text style={styles.controlLabelLight}>Принять</Text>
                  </Pressable>
                </>
              ) : callState?.phase === 'active' ? (
                <>
                  <Pressable
                    onPress={toggleMute}
                    style={({ pressed }) => [
                      styles.controlButton,
                      callState.isMuted
                        ? styles.controlButtonMuted
                        : styles.controlButtonNeutral,
                      pressed && styles.controlButtonPressed,
                    ]}
                  >
                    <Feather
                      name={callState.isMuted ? 'mic-off' : 'mic'}
                      size={22}
                      color={callState.isMuted ? '#FFFFFF' : '#1F2937'}
                    />
                    <Text
                      style={
                        callState.isMuted ? styles.controlLabelLight : styles.controlLabelDark
                      }
                    >
                      {callState.isMuted ? 'Микрофон выкл.' : 'Микрофон'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      void endCall();
                    }}
                    style={({ pressed }) => [
                      styles.controlButton,
                      styles.controlButtonDanger,
                      pressed && styles.controlButtonPressed,
                    ]}
                  >
                    <Feather name="phone-off" size={22} color="#FFFFFF" />
                    <Text style={styles.controlLabelLight}>Завершить</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={() => {
                    void endCall();
                  }}
                  style={({ pressed }) => [
                    styles.controlButtonWide,
                    styles.controlButtonDanger,
                    pressed && styles.controlButtonPressed,
                  ]}
                >
                  <Feather name="phone-off" size={22} color="#FFFFFF" />
                  <Text style={styles.controlLabelLight}>Отменить</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(8, 15, 28, 0.74)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  overlayCard: {
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: 24,
    paddingBottom: 28,
    alignItems: 'center',
  },
  heroSpacer: {
    height: 8,
  },
  avatar: {
    width: 118,
    height: 118,
    borderRadius: 59,
    marginTop: 8,
  },
  avatarFallback: {
    width: 118,
    height: 118,
    borderRadius: 59,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  avatarFallbackText: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  name: {
    marginTop: 20,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: '#18202E',
    textAlign: 'center',
  },
  status: {
    marginTop: 8,
    fontSize: 17,
    color: '#667085',
    textAlign: 'center',
  },
  controlsRow: {
    marginTop: 28,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  controlButton: {
    flex: 1,
    minHeight: 92,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  controlButtonWide: {
    width: '100%',
    minHeight: 92,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  controlButtonNeutral: {
    backgroundColor: '#EDF2FA',
  },
  controlButtonMuted: {
    backgroundColor: '#64748B',
  },
  controlButtonSuccess: {
    backgroundColor: '#22C55E',
  },
  controlButtonDanger: {
    backgroundColor: '#EF4444',
  },
  controlButtonPressed: {
    opacity: 0.82,
  },
  controlLabelLight: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  controlLabelDark: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
});
