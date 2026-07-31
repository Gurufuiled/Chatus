import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, Platform } from 'react-native';
import { Audio } from 'expo-av';
import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  type LocalVideoTrack,
  type Participant,
  type VideoTrack,
} from 'livekit-client';
import { Camera } from 'expo-camera';
import { AudioSession, AndroidAudioTypePresets } from '@livekit/react-native';
import { authStore } from '../stores/authStore';
import { useCall } from './CallContext';
import { resolveAvatarUrl } from '../config';
import {
  createGroupCall,
  endGroupCallForAll,
  fetchActiveGroupCall,
  isGroupCallUnavailableError,
  joinGroupCall,
  leaveGroupCall,
  type ApiGroupCallParticipant,
  type ApiGroupCallRoom,
} from '../services/groupCallService';
import { GroupCallOverlay } from '../components/group-call/GroupCallOverlay';
import { WebSocketService } from '../services/WebSocketService';
import { releaseMediaAudioSession } from '../utils/releaseMediaAudioSession';

export type GroupCallPhase =
  | 'idle'
  | 'creating'
  | 'joining'
  | 'active'
  | 'minimized';

export type GroupCallParticipant = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isLocal: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  isVideoEnabled: boolean;
};

type GroupCallState = {
  phase: GroupCallPhase;
  roomId: string | null;
  chatId: string | null;
  chatTitle: string;
  participants: GroupCallParticipant[];
  isMuted: boolean;
  isSpeakerOn: boolean;
  isVideoEnabled: boolean;
  startedAt?: number;
  isCreator: boolean;
  connectionState: ConnectionState | 'idle';
};

type GroupCallContextType = {
  state: GroupCallState;
  localCameraTrack: LocalVideoTrack | undefined;
  remoteVideoTracks: Record<string, VideoTrack>;
  activeRoomByChatId: Record<string, ApiGroupCallRoom | null>;
  refreshActiveRoom: (chatId: string) => Promise<ApiGroupCallRoom | null>;
  applyActiveRoomSnapshot: (chatId: string, room: ApiGroupCallRoom | null) => void;
  applyParticipantsSnapshot: (
    chatId: string,
    roomId: string,
    participants: ApiGroupCallParticipant[],
  ) => void;
  startGroupCall: (chatId: string, chatTitle: string) => Promise<void>;
  joinGroupCall: (roomId: string, chatId: string, chatTitle: string) => Promise<void>;
  leaveGroupCall: () => Promise<void>;
  endGroupCallForAll: () => Promise<void>;
  minimize: () => void;
  expand: () => void;
  toggleMute: () => Promise<void>;
  toggleSpeaker: () => Promise<void>;
  toggleVideo: () => Promise<void>;
  isInCallForChat: (chatId: string) => boolean;
};

const initialState: GroupCallState = {
  phase: 'idle',
  roomId: null,
  chatId: null,
  chatTitle: '',
  participants: [],
  isMuted: false,
  isSpeakerOn: true,
  isVideoEnabled: false,
  isCreator: false,
  connectionState: 'idle',
};

const GroupCallContext = createContext<GroupCallContextType | null>(null);

function mapApiParticipant(
  participant: ApiGroupCallParticipant,
  currentUserId: string,
): GroupCallParticipant {
  return {
    userId: participant.user_id,
    displayName: participant.display_name,
    avatarUrl: resolveAvatarUrl(participant.avatar_url),
    isLocal: participant.user_id === currentUserId,
    isMuted: participant.is_muted,
    isSpeaking: false,
    isVideoEnabled: false,
  };
}

function localParticipantProfile(currentUserId: string): {
  displayName: string;
  avatarUrl: string | null;
} {
  const user = authStore.getState().user;
  if (!user || user.id !== currentUserId) {
    return { displayName: '', avatarUrl: null };
  }
  const displayName =
    [user.display_name, user.last_name].filter(Boolean).join(' ').trim() ||
    user.username?.trim() ||
    user.handle?.trim() ||
    '';
  return {
    displayName,
    avatarUrl: resolveAvatarUrl(user.avatar_url),
  };
}

function isScreenShareTrackEnabled(participant: Participant): boolean {
  const pub = participant.getTrackPublication(Track.Source.ScreenShare);
  return Boolean(pub?.track && !pub.isMuted && pub.isEnabled);
}

function isCameraTrackEnabled(participant: Participant): boolean {
  const camPub = participant.getTrackPublication(Track.Source.Camera);
  return Boolean(camPub?.track && !camPub.isMuted && camPub.isEnabled);
}

function isVideoTrackEnabled(participant: Participant): boolean {
  return isScreenShareTrackEnabled(participant) || isCameraTrackEnabled(participant);
}

function isRemoteVideoPublicationReady(
  participant: Participant,
  pub: ReturnType<Participant['getTrackPublication']>,
): boolean {
  if (!pub || pub.isMuted || !pub.isEnabled) return false;
  if (participant.isLocal) return Boolean(pub.track);
  return Boolean(pub.track && pub.isSubscribed);
}

function readParticipantVideoTrack(participant: Participant): VideoTrack | undefined {
  const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
  const screenTrack = screenPub?.track;
  if (
    screenTrack?.kind === Track.Kind.Video &&
    isRemoteVideoPublicationReady(participant, screenPub)
  ) {
    return screenTrack as VideoTrack;
  }
  const camPub = participant.getTrackPublication(Track.Source.Camera);
  const camTrack = camPub?.track;
  if (
    camTrack?.kind === Track.Kind.Video &&
    isRemoteVideoPublicationReady(participant, camPub)
  ) {
    return camTrack as VideoTrack;
  }
  return undefined;
}

function readLocalPreviewTrack(room: Room): LocalVideoTrack | undefined {
  const track = readParticipantVideoTrack(room.localParticipant);
  return track?.kind === Track.Kind.Video ? (track as LocalVideoTrack) : undefined;
}

function readRemoteVideoTracks(room: Room): Record<string, VideoTrack> {
  const tracks: Record<string, VideoTrack> = {};
  for (const participant of room.remoteParticipants.values()) {
    if (!isVideoTrackEnabled(participant)) continue;
    const track = readParticipantVideoTrack(participant);
    if (track?.mediaStream) {
      tracks[participant.identity] = track;
    }
  }
  return tracks;
}

function apiProfileForUser(
  apiByUserId: Map<string, ApiGroupCallParticipant> | undefined,
  userId: string,
): { displayName: string; avatarUrl: string | null } | null {
  const api = apiByUserId?.get(userId);
  if (!api) return null;
  return {
    displayName: api.display_name,
    avatarUrl: resolveAvatarUrl(api.avatar_url),
  };
}

function mapLiveKitParticipant(
  participant: Participant,
  currentUserId: string,
  apiByUserId?: Map<string, ApiGroupCallParticipant>,
): GroupCallParticipant {
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  const isLocal = participant.identity === currentUserId;
  const localProfile = isLocal ? localParticipantProfile(currentUserId) : null;
  const apiProfile = apiProfileForUser(apiByUserId, participant.identity);
  return {
    userId: participant.identity,
    displayName:
      localProfile?.displayName ||
      apiProfile?.displayName ||
      participant.name ||
      participant.identity,
    avatarUrl: localProfile?.avatarUrl ?? apiProfile?.avatarUrl ?? null,
    isLocal,
    isMuted: micPub ? micPub.isMuted || !micPub.isEnabled : false,
    isSpeaking: participant.isSpeaking,
    isVideoEnabled: isVideoTrackEnabled(participant),
  };
}

function buildParticipantsFromRoom(
  room: Room,
  currentUserId: string,
  apiByUserId?: Map<string, ApiGroupCallParticipant>,
): GroupCallParticipant[] {
  const remote = [...room.remoteParticipants.values()].map((p) =>
    mapLiveKitParticipant(p, currentUserId, apiByUserId),
  );
  const local = room.localParticipant
    ? [mapLiveKitParticipant(room.localParticipant, currentUserId, apiByUserId)]
    : [];
  return [...local, ...remote];
}

function normalizeStartedAt(startedAt: number | string | undefined | null): number | undefined {
  if (typeof startedAt === 'number' && Number.isFinite(startedAt) && startedAt > 0) {
    return startedAt < 1_000_000_000_000 ? startedAt * 1000 : startedAt;
  }
  if (typeof startedAt === 'string') {
    const trimmed = startedAt.trim();
    if (!trimmed) return undefined;
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }
  }
  return undefined;
}

function resolveCallStartedAt(
  ...candidates: Array<number | string | undefined | null>
): number | undefined {
  for (const candidate of candidates) {
    const normalized = normalizeStartedAt(candidate);
    if (normalized != null) return normalized;
  }
  return undefined;
}

function buildCallAudioMode(isSpeakerOn: boolean) {
  return {
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: !isSpeakerOn,
  } satisfies Parameters<typeof Audio.setAudioModeAsync>[0];
}

/** LiveKit owns Android audio focus; expo-av setAudioModeAsync conflicts with WebRTC there. */
async function prepareGroupCallAudio(isSpeakerOn: boolean): Promise<void> {
  if (Platform.OS === 'android') {
    await AudioSession.configureAudio({
      android: {
        preferredOutputList: ['speaker', 'earpiece', 'bluetooth', 'headset'],
        audioTypeOptions: AndroidAudioTypePresets.communication,
      },
    });
    await AudioSession.startAudioSession();
    await AudioSession.selectAudioOutput(isSpeakerOn ? 'speaker' : 'earpiece');
    return;
  }
  await Audio.setAudioModeAsync(buildCallAudioMode(isSpeakerOn));
  await AudioSession.startAudioSession();
}

async function applyGroupCallSpeaker(isSpeakerOn: boolean): Promise<void> {
  if (Platform.OS === 'android') {
    await AudioSession.selectAudioOutput(isSpeakerOn ? 'speaker' : 'earpiece');
    return;
  }
  await Audio.setAudioModeAsync(buildCallAudioMode(isSpeakerOn));
}

export function GroupCallProvider({ children }: { children: React.ReactNode }) {
  const { callState } = useCall();
  const [state, setState] = useState<GroupCallState>(initialState);
  const [localCameraTrack, setLocalCameraTrack] = useState<LocalVideoTrack | undefined>();
  const [remoteVideoTracks, setRemoteVideoTracks] = useState<Record<string, VideoTrack>>({});
  const [activeRoomByChatId, setActiveRoomByChatId] = useState<
    Record<string, ApiGroupCallRoom | null>
  >({});
  const roomRef = useRef<Room | null>(null);
  const stateRef = useRef(state);
  const apiParticipantsByChatRef = useRef<
    Record<string, Map<string, ApiGroupCallParticipant>>
  >({});
  const leavingIntentionallyRef = useRef(false);
  const videoToggleInFlightRef = useRef(false);
  stateRef.current = state;

  const storeApiParticipantsSnapshot = useCallback(
    (chatId: string, participants: ApiGroupCallParticipant[]) => {
      apiParticipantsByChatRef.current = {
        ...apiParticipantsByChatRef.current,
        [chatId]: new Map(participants.map((p) => [p.user_id, p])),
      };
    },
    [],
  );

  const detachRoom = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (!room) return;
    room.removeAllListeners();
    try {
      await room.disconnect();
    } catch {
      // ignore
    }
    try {
      await AudioSession.stopAudioSession();
    } catch {
      // ignore
    }
  }, []);

  const resetCallState = useCallback(async () => {
    const chatId = stateRef.current.chatId;
    leavingIntentionallyRef.current = false;
    setLocalCameraTrack(undefined);
    setRemoteVideoTracks({});
    await detachRoom();
    if (chatId) {
      const next = { ...apiParticipantsByChatRef.current };
      delete next[chatId];
      apiParticipantsByChatRef.current = next;
    }
    setState(initialState);
    await releaseMediaAudioSession();
  }, [detachRoom]);

  const syncVideoTracksFromRoom = useCallback((room: Room) => {
    setLocalCameraTrack(readLocalPreviewTrack(room));
    setRemoteVideoTracks(readRemoteVideoTracks(room));
  }, []);

  const syncParticipantsFromRoom = useCallback((room: Room) => {
    const currentUserId = authStore.getState().user?.id;
    if (!currentUserId) return;
    syncVideoTracksFromRoom(room);
    setState((prev) => {
      const chatId = prev.chatId;
      const apiByUserId = chatId ? apiParticipantsByChatRef.current[chatId] : undefined;
      const fromRoom = buildParticipantsFromRoom(room, currentUserId, apiByUserId);
      const priorByUserId = new Map(prev.participants.map((p) => [p.userId, p]));
      const participants = fromRoom.map((p) => {
        const prior = priorByUserId.get(p.userId);
        if (!prior) return p;
        return {
          ...p,
          displayName: prior.displayName || p.displayName,
          avatarUrl: prior.avatarUrl ?? p.avatarUrl,
        };
      });
      const localParticipant = participants.find((p) => p.isLocal);
      return {
        ...prev,
        participants,
        isVideoEnabled: localParticipant?.isVideoEnabled ?? prev.isVideoEnabled,
      };
    });
  }, [syncVideoTracksFromRoom]);

  const connectToRoom = useCallback(
    async (params: {
      token: string;
      livekitUrl: string;
      roomName: string;
      chatId: string;
      chatTitle: string;
      roomId: string;
      startedAt: number;
      isCreator: boolean;
      phase: 'creating' | 'joining';
    }) => {
      const currentUserId = authStore.getState().user?.id;
      if (!currentUserId) {
        throw new Error('Not authenticated');
      }

      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Microphone permission denied');
      }

      await detachRoom();
      await prepareGroupCallAudio(true);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.ParticipantDisconnected, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.TrackMuted, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.TrackUnmuted, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.TrackPublished, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.TrackSubscribed, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.TrackUnpublished, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.TrackUnsubscribed, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const speakingIds = new Set(speakers.map((s) => s.identity));
        setState((prev) => ({
          ...prev,
          participants: prev.participants.map((p) => ({
            ...p,
            isSpeaking: speakingIds.has(p.userId),
          })),
        }));
      });
      room.on(RoomEvent.ConnectionStateChanged, (connectionState) => {
        if (connectionState === ConnectionState.Connected) {
          syncParticipantsFromRoom(room);
        }
        setState((prev) => ({
          ...prev,
          connectionState,
          phase:
            connectionState === ConnectionState.Connected &&
            (prev.phase === 'creating' || prev.phase === 'joining')
              ? 'active'
              : prev.phase,
        }));
      });
      room.on(RoomEvent.Disconnected, () => {
        const roomId = stateRef.current.roomId;
        const shouldNotifyServer = Boolean(roomId) && !leavingIntentionallyRef.current;
        leavingIntentionallyRef.current = false;
        void (async () => {
          if (shouldNotifyServer && roomId) {
            try {
              await leaveGroupCall(roomId);
            } catch {
              // ignore — local cleanup still runs
            }
          }
          await resetCallState();
        })();
      });

      await room.connect(params.livekitUrl, params.token, {
        autoSubscribe: true,
      });
      try {
        await room.startAudio();
      } catch {
        // Browser may require a later user gesture.
      }
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (micErr) {
        await detachRoom();
        throw micErr instanceof Error ? micErr : new Error(String(micErr));
      }

      const apiByUserId = apiParticipantsByChatRef.current[params.chatId];
      const participants = buildParticipantsFromRoom(room, currentUserId, apiByUserId);
      const startedAt =
        resolveCallStartedAt(
          params.startedAt,
          stateRef.current.startedAt,
          activeRoomByChatId[params.chatId]?.started_at,
        ) ?? Date.now();
      const isConnected = room.state === ConnectionState.Connected;

      setState((prev) => ({
        ...prev,
        phase: isConnected ? 'active' : params.phase,
        roomId: params.roomId,
        chatId: params.chatId,
        chatTitle: params.chatTitle,
        participants,
        isMuted: false,
        isSpeakerOn: true,
        isVideoEnabled: false,
        startedAt,
        isCreator: params.isCreator,
        connectionState: room.state,
      }));
      syncVideoTracksFromRoom(room);
    },
    [activeRoomByChatId, detachRoom, resetCallState, syncVideoTracksFromRoom, syncParticipantsFromRoom],
  );

  const refreshActiveRoom = useCallback(async (chatId: string) => {
    const room = await fetchActiveGroupCall(chatId);
    setActiveRoomByChatId((prev) => ({ ...prev, [chatId]: room }));
    return room;
  }, []);

  const applyActiveRoomSnapshot = useCallback(
    (chatId: string, room: ApiGroupCallRoom | null) => {
      setActiveRoomByChatId((prev) => ({ ...prev, [chatId]: room }));
      if (!room && stateRef.current.chatId === chatId) {
        void resetCallState();
      }
    },
    [resetCallState],
  );

  const applyParticipantsSnapshot = useCallback(
    (chatId: string, roomId: string, participants: ApiGroupCallParticipant[]) => {
      const currentUserId = authStore.getState().user?.id;
      if (!currentUserId) return;

      const prev = stateRef.current;
      if (prev.chatId !== chatId) return;
      if (prev.roomId && prev.roomId !== roomId) return;

      storeApiParticipantsSnapshot(chatId, participants);
      setState((current) => {
        if (current.chatId !== chatId) return current;
        if (current.roomId && current.roomId !== roomId) return current;

        const roomPatch = !current.roomId ? { roomId } : {};

        const isLiveKitActive =
          (current.phase === 'active' || current.phase === 'minimized') &&
          current.connectionState === ConnectionState.Connected;

        if (isLiveKitActive) {
          const apiByUserId = new Map(participants.map((p) => [p.user_id, p]));
          const merged = current.participants.map((live) => {
            const api = apiByUserId.get(live.userId);
            if (!api) return live;
            return {
              ...live,
              displayName: api.display_name || live.displayName,
              avatarUrl: resolveAvatarUrl(api.avatar_url) ?? live.avatarUrl,
              isMuted: live.isLocal ? live.isMuted : api.is_muted,
            };
          });
          for (const api of participants) {
            if (!merged.some((m) => m.userId === api.user_id)) {
              merged.push(mapApiParticipant(api, currentUserId));
            }
          }
          return { ...current, ...roomPatch, participants: merged };
        }

        return {
          ...current,
          ...roomPatch,
          participants: participants.map((p) => mapApiParticipant(p, currentUserId)),
        };
      });
    },
    [storeApiParticipantsSnapshot],
  );

  const startGroupCall = useCallback(
    async (chatId: string, chatTitle: string) => {
      if (callState) {
        Alert.alert('Голосовой чат', 'Сначала завершите текущий звонок.');
        return;
      }
      if (stateRef.current.phase !== 'idle') {
        Alert.alert('Голосовой чат', 'Сначала выйдите из текущего голосового чата.');
        return;
      }
      setState((prev) => ({
        ...prev,
        phase: 'creating',
        chatId,
        chatTitle,
      }));
      try {
        const response = await createGroupCall(chatId);
        setActiveRoomByChatId((prev) => ({ ...prev, [chatId]: response.room }));
        const callStartedAt =
          resolveCallStartedAt(response.room.started_at) ?? Date.now();
        setState((prev) => ({
          ...prev,
          roomId: response.room.id,
          startedAt: callStartedAt,
        }));
        await connectToRoom({
          token: response.token,
          livekitUrl: response.livekit_url,
          roomName: response.room_name,
          chatId,
          chatTitle,
          roomId: response.room.id,
          startedAt: response.room.started_at,
          isCreator: true,
          phase: 'creating',
        });
      } catch (err) {
        await resetCallState();
        Alert.alert(
          'Не удалось начать звонок',
          err instanceof Error ? err.message : String(err),
        );
      }
    },
    [callState, connectToRoom, resetCallState],
  );

  const joinGroupCallAction = useCallback(
    async (roomId: string, chatId: string, chatTitle: string) => {
      if (callState) {
        Alert.alert('Голосовой чат', 'Сначала завершите текущий звонок.');
        return;
      }
      if (
        stateRef.current.phase !== 'idle' &&
        stateRef.current.roomId !== roomId
      ) {
        Alert.alert('Голосовой чат', 'Сначала выйдите из текущего голосового чата.');
        return;
      }
      const cachedStartedAt = normalizeStartedAt(activeRoomByChatId[chatId]?.started_at);
      setState((prev) => ({
        ...prev,
        phase: 'joining',
        chatId,
        chatTitle,
        roomId,
        startedAt: cachedStartedAt ?? prev.startedAt,
      }));
      try {
        const response = await joinGroupCall(roomId);
        setActiveRoomByChatId((prev) => ({ ...prev, [chatId]: response.room }));
        const currentUserId = authStore.getState().user?.id;
        const joinedStartedAt = resolveCallStartedAt(
          response.room.started_at,
          cachedStartedAt,
        );
        if (joinedStartedAt != null) {
          setState((prev) => ({
            ...prev,
            startedAt: joinedStartedAt,
          }));
        }
        await connectToRoom({
          token: response.token,
          livekitUrl: response.livekit_url,
          roomName: response.room_name,
          chatId,
          chatTitle,
          roomId,
          startedAt: response.room.started_at ?? cachedStartedAt ?? Date.now(),
          isCreator: currentUserId === response.room.started_by_user_id,
          phase: 'joining',
        });
      } catch (err) {
        await resetCallState();
        const message = err instanceof Error ? err.message : String(err);
        if (isGroupCallUnavailableError(message)) {
          applyActiveRoomSnapshot(chatId, null);
          Alert.alert('Голосовой чат', 'Звонок уже завершён или недоступен.');
          return;
        }
        Alert.alert('Не удалось присоединиться', message);
      }
    },
    [activeRoomByChatId, callState, connectToRoom, resetCallState, applyActiveRoomSnapshot],
  );

  const leaveGroupCallAction = useCallback(async () => {
    const roomId = stateRef.current.roomId;
    const chatId = stateRef.current.chatId;
    leavingIntentionallyRef.current = true;
    if (!roomId) {
      await resetCallState();
      return;
    }
    try {
      await leaveGroupCall(roomId);
    } catch {
      // local cleanup even if API fails
    }
    await resetCallState();
    if (chatId) {
      try {
        const active = await refreshActiveRoom(chatId);
        if (!active || active.participant_count <= 0) {
          applyActiveRoomSnapshot(chatId, null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isGroupCallUnavailableError(message)) {
          applyActiveRoomSnapshot(chatId, null);
        }
      }
    }
  }, [applyActiveRoomSnapshot, resetCallState, refreshActiveRoom]);

  const endGroupCallForAllAction = useCallback(async () => {
    const roomId = stateRef.current.roomId;
    const chatId = stateRef.current.chatId;
    if (!roomId) return;
    leavingIntentionallyRef.current = true;
    try {
      await endGroupCallForAll(roomId);
    } catch (err) {
      Alert.alert(
        'Не удалось завершить звонок',
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
    if (chatId) {
      setActiveRoomByChatId((prev) => ({ ...prev, [chatId]: null }));
    }
    await resetCallState();
  }, [resetCallState]);

  const minimize = useCallback(() => {
    setState((prev) =>
      prev.phase === 'active' ? { ...prev, phase: 'minimized' } : prev,
    );
  }, []);

  const expand = useCallback(() => {
    setState((prev) =>
      prev.phase === 'minimized' ? { ...prev, phase: 'active' } : prev,
    );
  }, []);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const nextMuted = !stateRef.current.isMuted;
    try {
      await room.localParticipant.setMicrophoneEnabled(!nextMuted);
      setState((prev) => ({
        ...prev,
        isMuted: nextMuted,
        participants: prev.participants.map((p) =>
          p.isLocal ? { ...p, isMuted: nextMuted } : p,
        ),
      }));
    } catch (err) {
      Alert.alert(
        'Микрофон',
        err instanceof Error ? err.message : 'Не удалось переключить микрофон',
      );
    }
  }, []);

  const toggleSpeaker = useCallback(async () => {
    const nextSpeakerOn = !stateRef.current.isSpeakerOn;
    try {
      await applyGroupCallSpeaker(nextSpeakerOn);
      setState((prev) => ({ ...prev, isSpeakerOn: nextSpeakerOn }));
    } catch (err) {
      Alert.alert(
        'Динамик',
        err instanceof Error ? err.message : 'Не удалось переключить аудиовыход',
      );
    }
  }, []);

  const toggleVideo = useCallback(async () => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected || videoToggleInFlightRef.current) {
      return;
    }
    const nextEnabled = !stateRef.current.isVideoEnabled;
    videoToggleInFlightRef.current = true;
    try {
      if (nextEnabled) {
        const { status } = await Camera.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          throw new Error('Нет доступа к камере');
        }
      }
      await room.localParticipant.setCameraEnabled(nextEnabled);
      if (!roomRef.current || stateRef.current.phase === 'idle') return;
      syncVideoTracksFromRoom(room);
      const localParticipant = room.localParticipant;
      setState((prev) => ({
        ...prev,
        isVideoEnabled: isCameraTrackEnabled(localParticipant),
        participants: prev.participants.map((p) =>
          p.isLocal
            ? { ...p, isVideoEnabled: isVideoTrackEnabled(localParticipant) }
            : p,
        ),
      }));
    } catch (err) {
      if (!roomRef.current || stateRef.current.phase === 'idle') return;
      Alert.alert(
        nextEnabled ? 'Не удалось включить видео' : 'Не удалось выключить видео',
        err instanceof Error ? err.message : 'Проверь доступ к камере и попробуй ещё раз.',
      );
    } finally {
      videoToggleInFlightRef.current = false;
    }
  }, [syncVideoTracksFromRoom]);

  const isInCallForChat = useCallback(
    (chatId: string) =>
      stateRef.current.chatId === chatId &&
      stateRef.current.phase !== 'idle',
    [],
  );

  useEffect(() => {
    WebSocketService.setHandlers({
      onGroupCallStarted: (payload) => {
        const chatId = typeof payload.chat_id === 'string' ? payload.chat_id : null;
        const roomId = typeof payload.room_id === 'string' ? payload.room_id : null;
        const startedAt =
          typeof payload.started_at === 'number' || typeof payload.started_at === 'string'
            ? normalizeStartedAt(payload.started_at)
            : undefined;
        const startedBy =
          typeof payload.started_by === 'string' ? payload.started_by : '';
        if (!chatId || !roomId) return;
        const room: ApiGroupCallRoom = {
          id: roomId,
          chat_id: chatId,
          livekit_room_name: '',
          started_by_user_id: startedBy,
          started_at: startedAt ?? Date.now(),
          participant_count: 1,
        };
        applyActiveRoomSnapshot(chatId, room);
        if (
          stateRef.current.chatId === chatId &&
          stateRef.current.phase !== 'idle'
        ) {
          setState((prev) => ({
            ...prev,
            roomId: prev.roomId ?? roomId,
            startedAt:
              prev.startedAt ??
              startedAt ??
              normalizeStartedAt(room.started_at) ??
              Date.now(),
          }));
        }
      },
      onGroupCallEnded: (payload) => {
        const chatId = typeof payload.chat_id === 'string' ? payload.chat_id : null;
        if (!chatId) return;
        applyActiveRoomSnapshot(chatId, null);
      },
      onGroupCallParticipants: (payload) => {
        const chatId = typeof payload.chat_id === 'string' ? payload.chat_id : null;
        const roomId = typeof payload.room_id === 'string' ? payload.room_id : null;
        const participants = Array.isArray(payload.participants)
          ? (payload.participants as ApiGroupCallParticipant[])
          : [];
        if (!chatId || !roomId) return;
        if (participants.length === 0) {
          if (
            stateRef.current.chatId === chatId &&
            (stateRef.current.phase === 'creating' ||
              stateRef.current.phase === 'joining')
          ) {
            return;
          }
          applyActiveRoomSnapshot(chatId, null);
        } else {
          setActiveRoomByChatId((prev) => {
            const current = prev[chatId];
            if (!current || current.id !== roomId) return prev;
            return {
              ...prev,
              [chatId]: { ...current, participant_count: participants.length },
            };
          });
        }
        applyParticipantsSnapshot(chatId, roomId, participants);
      },
    });
  }, [applyActiveRoomSnapshot, applyParticipantsSnapshot]);

  useEffect(() => {
    return () => {
      void detachRoom();
    };
  }, [detachRoom]);

  const contextValue = useMemo<GroupCallContextType>(
    () => ({
      state,
      localCameraTrack,
      remoteVideoTracks,
      activeRoomByChatId,
      refreshActiveRoom,
      applyActiveRoomSnapshot,
      applyParticipantsSnapshot,
      startGroupCall,
      joinGroupCall: joinGroupCallAction,
      leaveGroupCall: leaveGroupCallAction,
      endGroupCallForAll: endGroupCallForAllAction,
      minimize,
      expand,
      toggleMute,
      toggleSpeaker,
      toggleVideo,
      isInCallForChat,
    }),
    [
      state,
      localCameraTrack,
      remoteVideoTracks,
      activeRoomByChatId,
      refreshActiveRoom,
      applyActiveRoomSnapshot,
      applyParticipantsSnapshot,
      startGroupCall,
      joinGroupCallAction,
      leaveGroupCallAction,
      endGroupCallForAllAction,
      minimize,
      expand,
      toggleMute,
      toggleSpeaker,
      toggleVideo,
      isInCallForChat,
    ],
  );

  return (
    <GroupCallContext.Provider value={contextValue}>
      {children}
      <GroupCallOverlay />
    </GroupCallContext.Provider>
  );
}

export function useGroupCall() {
  const ctx = useContext(GroupCallContext);
  if (!ctx) {
    throw new Error('useGroupCall must be used within GroupCallProvider');
  }
  return ctx;
}

export function useOptionalGroupCall() {
  return useContext(GroupCallContext);
}
