import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  type LocalVideoTrack,
  type Participant,
  type RemoteAudioTrack,
  type VideoTrack,
} from 'livekit-client';
import { useAuthUiStore } from '@/stores/authUiStore';
import { resolveMediaUrl } from '@/services/mediaService';
import {
  createGroupCall,
  endGroupCallForAll,
  fetchActiveGroupCall,
  isGroupCallUnavailableError,
  joinGroupCall,
  leaveGroupCall,
  type ApiGroupCallParticipant,
  type ApiGroupCallRoom,
} from '@/services/groupCallService';
import { wsClient } from '@/ws/wsClient';
import { GroupCallOverlay } from '@/features/group-call/GroupCallOverlay';

export type GroupCallPhase = 'idle' | 'creating' | 'joining' | 'active';

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
  isVideoEnabled: boolean;
  isScreenShareEnabled: boolean;
  remoteVolume: number;
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
  toggleMute: () => Promise<void>;
  toggleVideo: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  setRemoteVolume: (volume: number) => void;
  isInCallForChat: (chatId: string) => boolean;
};

const initialState: GroupCallState = {
  phase: 'idle',
  roomId: null,
  chatId: null,
  chatTitle: '',
  participants: [],
  isMuted: false,
  isVideoEnabled: false,
  isScreenShareEnabled: false,
  remoteVolume: 1,
  isCreator: false,
  connectionState: 'idle',
};

const GroupCallContext = createContext<GroupCallContextType | null>(null);

function resolveAvatarUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl?.trim()) return null;
  return resolveMediaUrl(avatarUrl);
}

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
  const user = useAuthUiStore.getState().user;
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

function readParticipantVideoTrack(participant: Participant): VideoTrack | undefined {
  const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
  const screenTrack = screenPub?.track;
  if (
    screenTrack?.kind === Track.Kind.Video &&
    screenPub &&
    !screenPub.isMuted &&
    screenPub.isEnabled
  ) {
    return screenTrack as VideoTrack;
  }
  const camPub = participant.getTrackPublication(Track.Source.Camera);
  const camTrack = camPub?.track;
  if (camTrack?.kind === Track.Kind.Video && camPub && !camPub.isMuted && camPub.isEnabled) {
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
    if (track) {
      tracks[participant.identity] = track;
    }
  }
  return tracks;
}

function applyRemoteVolumeToRoom(room: Room, volume: number) {
  const clamped = Math.min(1, Math.max(0, volume));
  for (const participant of room.remoteParticipants.values()) {
    for (const pub of participant.trackPublications.values()) {
      if (pub.kind === Track.Kind.Audio && pub.track) {
        (pub.track as RemoteAudioTrack).setVolume(clamped);
      }
    }
  }
}

function mapLiveKitParticipant(
  participant: Participant,
  currentUserId: string,
): GroupCallParticipant {
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  const isLocal = participant.identity === currentUserId;
  const profile = isLocal ? localParticipantProfile(currentUserId) : null;
  return {
    userId: participant.identity,
    displayName: profile?.displayName || participant.name || participant.identity,
    avatarUrl: profile?.avatarUrl ?? null,
    isLocal,
    isMuted: micPub ? micPub.isMuted || !micPub.isEnabled : false,
    isSpeaking: participant.isSpeaking,
    isVideoEnabled: isVideoTrackEnabled(participant),
  };
}

function buildParticipantsFromRoom(room: Room, currentUserId: string): GroupCallParticipant[] {
  const remote = [...room.remoteParticipants.values()].map((p) =>
    mapLiveKitParticipant(p, currentUserId),
  );
  const local = room.localParticipant
    ? [mapLiveKitParticipant(room.localParticipant, currentUserId)]
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

function showAlert(title: string, message?: string) {
  window.alert(message ? `${title}\n\n${message}` : title);
}

async function ensureMicrophonePermission(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Микрофон недоступен в этом браузере');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

async function ensureCameraPermission(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Камера недоступна в этом браузере');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function GroupCallProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GroupCallState>(initialState);
  const [localCameraTrack, setLocalCameraTrack] = useState<LocalVideoTrack | undefined>();
  const [remoteVideoTracks, setRemoteVideoTracks] = useState<Record<string, VideoTrack>>({});
  const [activeRoomByChatId, setActiveRoomByChatId] = useState<
    Record<string, ApiGroupCallRoom | null>
  >({});
  const roomRef = useRef<Room | null>(null);
  const stateRef = useRef(state);
  const activeRoomByChatIdRef = useRef(activeRoomByChatId);
  const connectGenerationRef = useRef(0);
  const leavingIntentionallyRef = useRef(false);
  const videoToggleInFlightRef = useRef(false);
  const screenShareToggleInFlightRef = useRef(false);
  const remoteVolumeRef = useRef(1);
  stateRef.current = state;
  activeRoomByChatIdRef.current = activeRoomByChatId;

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
  }, []);

  const resetCallState = useCallback(async () => {
    leavingIntentionallyRef.current = false;
    remoteVolumeRef.current = initialState.remoteVolume;
    setLocalCameraTrack(undefined);
    setRemoteVideoTracks({});
    await detachRoom();
    setState(initialState);
  }, [detachRoom]);

  const invalidateConnectAttempt = useCallback(() => {
    connectGenerationRef.current += 1;
  }, []);

  const syncVideoTracksFromRoom = useCallback((room: Room) => {
    setLocalCameraTrack(readLocalPreviewTrack(room));
    setRemoteVideoTracks(readRemoteVideoTracks(room));
    applyRemoteVolumeToRoom(room, remoteVolumeRef.current);
  }, []);

  const syncParticipantsFromRoom = useCallback(
    (room: Room) => {
      const currentUserId = useAuthUiStore.getState().user?.id;
      if (!currentUserId) return;
      syncVideoTracksFromRoom(room);
      setState((prev) => {
        const fromRoom = buildParticipantsFromRoom(room, currentUserId);
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
        const localLive = room.localParticipant;
        return {
          ...prev,
          participants,
          isVideoEnabled: localParticipant?.isVideoEnabled ?? prev.isVideoEnabled,
          isScreenShareEnabled: localLive ? isScreenShareTrackEnabled(localLive) : prev.isScreenShareEnabled,
        };
      });
    },
    [syncVideoTracksFromRoom],
  );

  const connectToRoom = useCallback(
    async (params: {
      token: string;
      livekitUrl: string;
      chatId: string;
      chatTitle: string;
      roomId: string;
      startedAt: number;
      isCreator: boolean;
      phase: 'creating' | 'joining';
      connectGeneration: number;
    }) => {
      const currentUserId = useAuthUiStore.getState().user?.id;
      if (!currentUserId) {
        throw new Error('Not authenticated');
      }

      await detachRoom();

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
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          (track as RemoteAudioTrack).setVolume(remoteVolumeRef.current);
        }
        syncParticipantsFromRoom(room);
      });
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
              // ignore
            }
          }
          await resetCallState();
        })();
      });

      await room.connect(params.livekitUrl, params.token, {
        autoSubscribe: true,
      });
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (micErr) {
        await detachRoom();
        throw micErr instanceof Error ? micErr : new Error(String(micErr));
      }

      const participants = buildParticipantsFromRoom(room, currentUserId);
      const startedAt =
        resolveCallStartedAt(
          params.startedAt,
          stateRef.current.startedAt,
          activeRoomByChatId[params.chatId]?.started_at,
        ) ?? Date.now();
      const isConnected = room.state === ConnectionState.Connected;

      if (params.connectGeneration !== connectGenerationRef.current) {
        await detachRoom();
        return;
      }
      if (!activeRoomByChatIdRef.current[params.chatId]) {
        await detachRoom();
        return;
      }

      setState((prev) => ({
        ...prev,
        phase: isConnected ? 'active' : params.phase,
        roomId: params.roomId,
        chatId: params.chatId,
        chatTitle: params.chatTitle,
        participants,
        isMuted: false,
        isVideoEnabled: false,
        startedAt,
        isCreator: params.isCreator,
        connectionState: room.state,
      }));
      syncVideoTracksFromRoom(room);
    },
    [activeRoomByChatId, detachRoom, resetCallState, syncParticipantsFromRoom, syncVideoTracksFromRoom],
  );

  const refreshActiveRoom = useCallback(async (chatId: string) => {
    const room = await fetchActiveGroupCall(chatId);
    setActiveRoomByChatId((prev) => ({ ...prev, [chatId]: room }));
    return room;
  }, []);

  const applyActiveRoomSnapshot = useCallback(
    (chatId: string, room: ApiGroupCallRoom | null) => {
      if (!room) {
        invalidateConnectAttempt();
      }
      setActiveRoomByChatId((prev) => ({ ...prev, [chatId]: room }));
      if (!room && stateRef.current.chatId === chatId) {
        void resetCallState();
      }
    },
    [invalidateConnectAttempt, resetCallState],
  );

  const applyParticipantsSnapshot = useCallback(
    (chatId: string, roomId: string, participants: ApiGroupCallParticipant[]) => {
      const currentUserId = useAuthUiStore.getState().user?.id;
      if (!currentUserId) return;
      setState((prev) => {
        if (prev.chatId !== chatId || prev.roomId !== roomId) return prev;

        const isLiveKitActive =
          prev.phase === 'active' && prev.connectionState === ConnectionState.Connected;

        if (isLiveKitActive) {
          const apiByUserId = new Map(participants.map((p) => [p.user_id, p]));
          const merged = prev.participants.map((live) => {
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
          return { ...prev, participants: merged };
        }

        return {
          ...prev,
          participants: participants.map((p) => mapApiParticipant(p, currentUserId)),
        };
      });
    },
    [],
  );

  const startGroupCall = useCallback(
    async (chatId: string, chatTitle: string) => {
      if (stateRef.current.phase !== 'idle') {
        showAlert('Голосовой чат', 'Сначала выйдите из текущего голосового чата.');
        return;
      }
      const connectGeneration = ++connectGenerationRef.current;
      setState((prev) => ({
        ...prev,
        phase: 'creating',
        chatId,
        chatTitle,
      }));
      try {
        await ensureMicrophonePermission();
        const response = await createGroupCall(chatId);
        setActiveRoomByChatId((prev) => ({ ...prev, [chatId]: response.room }));
        await connectToRoom({
          token: response.token,
          livekitUrl: response.livekit_url,
          chatId,
          chatTitle,
          roomId: response.room.id,
          startedAt: response.room.started_at,
          isCreator: true,
          phase: 'creating',
          connectGeneration,
        });
      } catch (err) {
        await resetCallState();
        showAlert(
          'Не удалось начать звонок',
          err instanceof Error ? err.message : String(err),
        );
      }
    },
    [connectToRoom, resetCallState],
  );

  const joinGroupCallAction = useCallback(
    async (roomId: string, chatId: string, chatTitle: string) => {
      if (stateRef.current.phase !== 'idle') {
        if (stateRef.current.roomId !== roomId) {
          showAlert('Голосовой чат', 'Сначала выйдите из текущего голосового чата.');
        }
        return;
      }
      const connectGeneration = ++connectGenerationRef.current;
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
        await ensureMicrophonePermission();
        const response = await joinGroupCall(roomId);
        setActiveRoomByChatId((prev) => ({ ...prev, [chatId]: response.room }));
        const currentUserId = useAuthUiStore.getState().user?.id;
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
          chatId,
          chatTitle,
          roomId,
          startedAt: response.room.started_at ?? cachedStartedAt ?? Date.now(),
          isCreator: currentUserId === response.room.started_by_user_id,
          phase: 'joining',
          connectGeneration,
        });
      } catch (err) {
        await resetCallState();
        if (!activeRoomByChatIdRef.current[chatId]) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        if (isGroupCallUnavailableError(message)) {
          applyActiveRoomSnapshot(chatId, null);
          showAlert('Голосовой чат', 'Звонок уже завершён или недоступен.');
          return;
        }
        showAlert('Не удалось присоединиться', message);
      }
    },
    [activeRoomByChatId, applyActiveRoomSnapshot, connectToRoom, resetCallState],
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
    if (chatId) {
      void refreshActiveRoom(chatId).catch(() => {
        setActiveRoomByChatId((prev) => ({ ...prev, [chatId]: null }));
      });
    }
    await resetCallState();
  }, [resetCallState, refreshActiveRoom]);

  const endGroupCallForAllAction = useCallback(async () => {
    const roomId = stateRef.current.roomId;
    const chatId = stateRef.current.chatId;
    if (!roomId) return;
    leavingIntentionallyRef.current = true;
    try {
      await endGroupCallForAll(roomId);
    } catch (err) {
      showAlert(
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
      showAlert(
        'Микрофон',
        err instanceof Error ? err.message : 'Не удалось переключить микрофон',
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
        await ensureCameraPermission();
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
      showAlert(
        nextEnabled ? 'Не удалось включить видео' : 'Не удалось выключить видео',
        err instanceof Error
          ? err.message
          : 'Проверьте доступ к камере и попробуйте ещё раз.',
      );
    } finally {
      videoToggleInFlightRef.current = false;
    }
  }, [syncVideoTracksFromRoom]);

  const setRemoteVolume = useCallback((volume: number) => {
    const clamped = Math.min(1, Math.max(0, volume));
    remoteVolumeRef.current = clamped;
    setState((prev) => ({ ...prev, remoteVolume: clamped }));
    const room = roomRef.current;
    if (room) {
      applyRemoteVolumeToRoom(room, clamped);
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (
      !room ||
      room.state !== ConnectionState.Connected ||
      screenShareToggleInFlightRef.current
    ) {
      return;
    }
    const nextEnabled = !stateRef.current.isScreenShareEnabled;
    screenShareToggleInFlightRef.current = true;
    try {
      await room.localParticipant.setScreenShareEnabled(nextEnabled, { audio: false });
      if (!roomRef.current || stateRef.current.phase === 'idle') return;
      syncVideoTracksFromRoom(room);
      setState((prev) => ({
        ...prev,
        isScreenShareEnabled: nextEnabled,
        participants: prev.participants.map((p) =>
          p.isLocal ? { ...p, isVideoEnabled: isVideoTrackEnabled(room.localParticipant) } : p,
        ),
      }));
    } catch (err) {
      if (!roomRef.current || stateRef.current.phase === 'idle') return;
      showAlert(
        nextEnabled ? 'Не удалось включить демонстрацию' : 'Не удалось выключить демонстрацию',
        err instanceof Error ? err.message : 'Проверьте разрешение на запись экрана.',
      );
    } finally {
      screenShareToggleInFlightRef.current = false;
    }
  }, [syncVideoTracksFromRoom]);

  const isInCallForChat = useCallback(
    (chatId: string) =>
      stateRef.current.chatId === chatId && stateRef.current.phase !== 'idle',
    [],
  );

  useEffect(() => {
    wsClient.setHandlers({
      onGroupCallStarted: (payload) => {
        const chatId = typeof payload.chat_id === 'string' ? payload.chat_id : null;
        const roomId = typeof payload.room_id === 'string' ? payload.room_id : null;
        const startedAt =
          typeof payload.started_at === 'number' || typeof payload.started_at === 'string'
            ? normalizeStartedAt(payload.started_at)
            : undefined;
        const startedBy = typeof payload.started_by === 'string' ? payload.started_by : '';
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
      },
      onGroupCallEnded: (payload) => {
        const chatId = typeof payload.chat_id === 'string' ? payload.chat_id : null;
        const roomId = typeof payload.room_id === 'string' ? payload.room_id : null;
        if (!chatId) return;
        const current = activeRoomByChatIdRef.current[chatId];
        if (roomId && current && current.id !== roomId) return;
        applyActiveRoomSnapshot(chatId, null);
      },
      onGroupCallParticipants: (payload) => {
        const chatId = typeof payload.chat_id === 'string' ? payload.chat_id : null;
        const roomId = typeof payload.room_id === 'string' ? payload.room_id : null;
        const participants = Array.isArray(payload.participants)
          ? (payload.participants as ApiGroupCallParticipant[])
          : [];
        if (!chatId || !roomId) return;
        setActiveRoomByChatId((prev) => {
          const current = prev[chatId];
          if (!current || current.id !== roomId) return prev;
          return {
            ...prev,
            [chatId]: { ...current, participant_count: participants.length },
          };
        });
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
      toggleMute,
      toggleVideo,
      toggleScreenShare,
      setRemoteVolume,
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
      toggleMute,
      toggleVideo,
      toggleScreenShare,
      setRemoteVolume,
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
