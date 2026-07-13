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
  ScreenSharePresets,
  Track,
  VideoPresets,
  type LocalVideoTrack,
  type Participant,
  type RemoteAudioTrack,
  type RemoteTrack,
  type RemoteTrackPublication,
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
import {
  CallRecordingService,
  type CallRecordingSnapshot,
  isCallRecordingSupported,
} from '@/features/group-call/CallRecordingService';
import {
  buildGroupCallRecordingPayload,
  parseGroupCallRecordingMessage,
} from '@/features/group-call/groupCallRecordingMessage';
import {
  formatCameraAccessError,
  formatDisplayMediaAccessError,
  formatMicrophoneAccessError,
  notifyParentMicrophoneRequired,
} from '@/utils/microphoneAccess';

/**
 * Publish quality (trade-off notes):
 * - Webcam: 720p/30fps (~1.7 Mbps default LiveKit bitrate for h720) with
 *   simulcast on — sharp enough for a talking-head tile while still letting
 *   LiveKit's dynacast/adaptiveStream drop unused higher layers for viewers
 *   on small tiles or a poor connection.
 * - Screen share: 1080p but capped at 15fps (LiveKit's `h1080fps15` preset,
 *   ~2.5 Mbps). Screen shares are usually static/text-heavy — trading frame
 *   rate for resolution keeps text legible without spending bandwidth on
 *   motion smoothness nobody needs. Simulcast is left off for screen share
 *   since a second lower-res layer would just blur text further; dynacast
 *   still stops sending entirely when nobody is subscribed.
 */
const CAMERA_CAPTURE_DEFAULTS = { resolution: VideoPresets.h720.resolution };
const CAMERA_PUBLISH_DEFAULTS = {
  videoEncoding: VideoPresets.h720.encoding,
  simulcast: true,
};
const SCREEN_SHARE_CAPTURE_OPTIONS = {
  resolution: ScreenSharePresets.h1080fps15.resolution,
};
const SCREEN_SHARE_PUBLISH_OPTIONS = {
  videoEncoding: ScreenSharePresets.h1080fps15.encoding,
  simulcast: false,
};

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
  /** Per-remote-participant playback volume (0–1). */
  remoteVolumes: Record<string, number>;
  audioPlaybackBlocked: boolean;
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
  setParticipantVolume: (userId: string, volume: number) => void;
  getParticipantVolume: (userId: string) => number;
  unlockAudioPlayback: () => Promise<void>;
  isInCallForChat: (chatId: string) => boolean;
  recording: CallRecordingSnapshot;
  recordingSupported: boolean;
  /** Remote participant recording indicator (LiveKit data channel). */
  remoteRecording: { active: boolean; byDisplayName: string | null };
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  saveRecording: () => Promise<void>;
  discardRecording: () => void;
  clearRecordingError: () => void;
  mediaErrorBanner: string | null;
  clearMediaErrorBanner: () => void;
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
  remoteVolumes: {},
  audioPlaybackBlocked: false,
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

const initialRemoteRecording = { active: false, byDisplayName: null as string | null };

async function publishGroupCallRecordingState(room: Room, active: boolean): Promise<void> {
  if (room.state !== ConnectionState.Connected) return;
  const currentUserId = useAuthUiStore.getState().user?.id;
  if (!currentUserId) return;
  const { displayName } = localParticipantProfile(currentUserId);
  try {
    await room.localParticipant.publishData(
      buildGroupCallRecordingPayload(active, currentUserId, displayName || 'Участник'),
      { reliable: true },
    );
  } catch (err) {
    console.warn('[GroupCall] failed to publish recording state', err);
  }
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

const DEFAULT_PARTICIPANT_VOLUME = 1;

function clampParticipantVolume(volume: number): number {
  return Math.min(1, Math.max(0, volume));
}

function readParticipantVolume(
  volumes: Record<string, number>,
  userId: string,
): number {
  const value = volumes[userId];
  return typeof value === 'number' && Number.isFinite(value)
    ? clampParticipantVolume(value)
    : DEFAULT_PARTICIPANT_VOLUME;
}

function applyMicVolumeToParticipant(participant: Participant, volume: number) {
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  const track = micPub?.track;
  if (track?.kind === Track.Kind.Audio) {
    (track as RemoteAudioTrack).setVolume(clampParticipantVolume(volume));
  }
}

function applyParticipantVolumeToRoom(room: Room, userId: string, volume: number) {
  const participant = room.remoteParticipants.get(userId);
  if (!participant) return;
  applyMicVolumeToParticipant(participant, volume);
}

function applyRemoteVolumesToRoom(room: Room, volumes: Record<string, number>) {
  for (const participant of room.remoteParticipants.values()) {
    applyMicVolumeToParticipant(
      participant,
      readParticipantVolume(volumes, participant.identity),
    );
  }
}

function applyMicVolumeToRemoteTrack(
  track: RemoteTrack,
  publication: RemoteTrackPublication | undefined,
  participant: Participant | undefined,
  volumes: Record<string, number>,
) {
  if (track.kind !== Track.Kind.Audio || participant?.isLocal) return;
  if (
    publication?.source != null &&
    publication.source !== Track.Source.Microphone &&
    publication.source !== Track.Source.Unknown
  ) {
    return;
  }
  const userId = participant?.identity;
  if (!userId) return;
  (track as RemoteAudioTrack).setVolume(readParticipantVolume(volumes, userId));
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

const initialRecordingSnapshot: CallRecordingSnapshot = {
  phase: 'idle',
  startedAt: null,
  error: null,
  warning: null,
  pendingBlob: null,
  pendingFilename: null,
};

export function GroupCallProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GroupCallState>(initialState);
  const [localCameraTrack, setLocalCameraTrack] = useState<LocalVideoTrack | undefined>();
  const [remoteVideoTracks, setRemoteVideoTracks] = useState<Record<string, VideoTrack>>({});
  const [activeRoomByChatId, setActiveRoomByChatId] = useState<
    Record<string, ApiGroupCallRoom | null>
  >({});
  const [recording, setRecording] = useState<CallRecordingSnapshot>(initialRecordingSnapshot);
  const [remoteRecording, setRemoteRecording] = useState(initialRemoteRecording);
  const [mediaErrorBanner, setMediaErrorBanner] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const stateRef = useRef(state);
  const activeRoomByChatIdRef = useRef(activeRoomByChatId);
  const connectGenerationRef = useRef(0);
  const leavingIntentionallyRef = useRef(false);
  const videoToggleInFlightRef = useRef(false);
  const screenShareToggleInFlightRef = useRef(false);
  const remoteVolumesRef = useRef<Record<string, number>>({});
  const localRecordingActiveRef = useRef(false);
  const remoteRecordingByUserIdRef = useRef<string | null>(null);
  const recordingServiceRef = useRef<CallRecordingService | null>(null);
  if (!recordingServiceRef.current) {
    recordingServiceRef.current = new CallRecordingService();
  }
  stateRef.current = state;
  activeRoomByChatIdRef.current = activeRoomByChatId;

  useEffect(() => {
    const service = recordingServiceRef.current;
    if (!service) return;
    return service.subscribe(setRecording);
  }, []);

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
    const recordingService = recordingServiceRef.current;
    const room = roomRef.current;
    if (recordingService) {
      const phase = recordingService.snapshot().phase;
      if (phase === 'recording' || phase === 'requesting' || phase === 'stopping') {
        // Stop while LiveKit tracks are still available for a clean final chunk.
        await recordingService.stopBecauseCallEnded();
      }
    }
    if (localRecordingActiveRef.current && room) {
      localRecordingActiveRef.current = false;
      await publishGroupCallRecordingState(room, false);
    }
    localRecordingActiveRef.current = false;
    remoteRecordingByUserIdRef.current = null;
    setRemoteRecording(initialRemoteRecording);
    leavingIntentionallyRef.current = false;
    remoteVolumesRef.current = {};
    setLocalCameraTrack(undefined);
    setRemoteVideoTracks({});
    setMediaErrorBanner(null);
    await detachRoom();
    setState(initialState);
  }, [detachRoom]);

  const invalidateConnectAttempt = useCallback(() => {
    connectGenerationRef.current += 1;
  }, []);

  const syncAudioPlaybackState = useCallback((room: Room) => {
    setState((prev) => ({
      ...prev,
      audioPlaybackBlocked: !room.canPlaybackAudio,
    }));
  }, []);

  const ensureRoomAudioPlayback = useCallback(
    async (room: Room) => {
      try {
        await room.startAudio();
      } catch {
        // Browser may require an explicit tap — unlockAudioPlayback handles that.
      }
      syncAudioPlaybackState(room);
    },
    [syncAudioPlaybackState],
  );

  const syncVideoTracksFromRoom = useCallback((room: Room) => {
    setLocalCameraTrack(readLocalPreviewTrack(room));
    setRemoteVideoTracks(readRemoteVideoTracks(room));
    applyRemoteVolumesToRoom(room, remoteVolumesRef.current);
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
        videoCaptureDefaults: CAMERA_CAPTURE_DEFAULTS,
        publishDefaults: CAMERA_PUBLISH_DEFAULTS,
      });
      roomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, () => {
        syncParticipantsFromRoom(room);
        if (localRecordingActiveRef.current) {
          void publishGroupCallRecordingState(room, true);
        }
      });
      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        syncParticipantsFromRoom(room);
        if (remoteRecordingByUserIdRef.current === participant.identity) {
          remoteRecordingByUserIdRef.current = null;
          setRemoteRecording(initialRemoteRecording);
        }
      });
      room.on(RoomEvent.TrackMuted, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.TrackUnmuted, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.TrackPublished, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.LocalTrackPublished, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.LocalTrackUnpublished, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        applyMicVolumeToRemoteTrack(
          track,
          publication,
          participant,
          remoteVolumesRef.current,
        );
        if (track.kind === Track.Kind.Audio) {
          void ensureRoomAudioPlayback(room);
        }
        syncParticipantsFromRoom(room);
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        syncAudioPlaybackState(room);
      });
      room.on(RoomEvent.TrackUnpublished, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.TrackUnsubscribed, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.DataReceived, (payload, participant) => {
        const msg = parseGroupCallRecordingMessage(payload);
        if (!msg || !participant) return;
        const senderId = participant.identity;
        if (!senderId || msg.byUserId !== senderId) return;
        const selfId = useAuthUiStore.getState().user?.id;
        if (selfId && senderId === selfId) return;
        if (msg.active) {
          // First active recorder wins until they stop or leave.
          if (
            remoteRecordingByUserIdRef.current &&
            remoteRecordingByUserIdRef.current !== senderId
          ) {
            return;
          }
          remoteRecordingByUserIdRef.current = senderId;
          setRemoteRecording({
            active: true,
            byDisplayName: msg.byDisplayName || null,
          });
          return;
        }
        if (remoteRecordingByUserIdRef.current !== senderId) {
          return;
        }
        remoteRecordingByUserIdRef.current = null;
        setRemoteRecording(initialRemoteRecording);
      });
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
          // Re-sync recording flag after reconnect (including active: false if we stopped offline).
          void publishGroupCallRecordingState(room, localRecordingActiveRef.current);
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

      await ensureRoomAudioPlayback(room);

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
    [activeRoomByChatId, detachRoom, ensureRoomAudioPlayback, resetCallState, syncAudioPlaybackState, syncParticipantsFromRoom, syncVideoTracksFromRoom],
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
    const room = roomRef.current;
    leavingIntentionallyRef.current = true;
    // Finalize local recording while LiveKit tracks are still alive.
    const wasRecording =
      localRecordingActiveRef.current ||
      recordingServiceRef.current?.snapshot().phase === 'recording';
    await recordingServiceRef.current?.stopBecauseCallEnded();
    if (wasRecording && room) {
      localRecordingActiveRef.current = false;
      await publishGroupCallRecordingState(room, false);
    }
    localRecordingActiveRef.current = false;
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
    const room = roomRef.current;
    leavingIntentionallyRef.current = true;
    const wasRecording =
      localRecordingActiveRef.current ||
      recordingServiceRef.current?.snapshot().phase === 'recording';
    await recordingServiceRef.current?.stopBecauseCallEnded();
    if (wasRecording && room) {
      localRecordingActiveRef.current = false;
      await publishGroupCallRecordingState(room, false);
    }
    localRecordingActiveRef.current = false;
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
      notifyParentMicrophoneRequired();
      setMediaErrorBanner(formatMicrophoneAccessError(err));
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
      // Resolution/bitrate come from the Room's videoCaptureDefaults/publishDefaults
      // (see CAMERA_CAPTURE_DEFAULTS/CAMERA_PUBLISH_DEFAULTS above).
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
      setMediaErrorBanner(
        formatCameraAccessError(
          err instanceof Error
            ? err
            : new Error('Проверьте доступ к камере и попробуйте ещё раз.'),
        ),
      );
    } finally {
      videoToggleInFlightRef.current = false;
    }
  }, [syncVideoTracksFromRoom]);

  const getParticipantVolume = useCallback((userId: string) => {
    return readParticipantVolume(remoteVolumesRef.current, userId);
  }, []);

  const setParticipantVolume = useCallback((userId: string, volume: number) => {
    const clamped = clampParticipantVolume(volume);
    remoteVolumesRef.current = { ...remoteVolumesRef.current, [userId]: clamped };
    setState((prev) => ({
      ...prev,
      remoteVolumes: { ...prev.remoteVolumes, [userId]: clamped },
    }));
    const room = roomRef.current;
    if (room) {
      applyParticipantVolumeToRoom(room, userId, clamped);
    }
  }, []);

  const unlockAudioPlayback = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    await ensureRoomAudioPlayback(room);
  }, [ensureRoomAudioPlayback]);

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
      await room.localParticipant.setScreenShareEnabled(
        nextEnabled,
        { ...SCREEN_SHARE_CAPTURE_OPTIONS, audio: false },
        SCREEN_SHARE_PUBLISH_OPTIONS,
      );
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
      setMediaErrorBanner(
        formatDisplayMediaAccessError(
          err instanceof Error ? err : new Error('Проверьте разрешение на запись экрана.'),
        ),
      );
    } finally {
      screenShareToggleInFlightRef.current = false;
    }
  }, [syncVideoTracksFromRoom]);

  const startRecording = useCallback(async () => {
    const room = roomRef.current;
    const service = recordingServiceRef.current;
    if (!room || !service) return;
    if (room.state !== ConnectionState.Connected) {
      service.reportError('Запись доступна после подключения к звонку');
      return;
    }
    await service.start(room);
    if (
      roomRef.current !== room ||
      room.state !== ConnectionState.Connected ||
      service.snapshot().phase !== 'recording'
    ) {
      return;
    }
    localRecordingActiveRef.current = true;
    await publishGroupCallRecordingState(room, true);
  }, []);

  const stopRecording = useCallback(async () => {
    const service = recordingServiceRef.current;
    const room = roomRef.current;
    if (!service) return;
    const wasRecording =
      localRecordingActiveRef.current || service.snapshot().phase === 'recording';
    await service.stop();
    if (wasRecording) {
      localRecordingActiveRef.current = false;
      if (room) {
        await publishGroupCallRecordingState(room, false);
      }
    }
  }, []);

  // If recording ends via error salvage while still in-call, clear the remote indicator.
  useEffect(() => {
    const room = roomRef.current;
    if (!localRecordingActiveRef.current) return;
    if (recording.phase === 'recording' || recording.phase === 'stopping' || recording.phase === 'requesting') {
      return;
    }
    localRecordingActiveRef.current = false;
    if (room && room.state === ConnectionState.Connected) {
      void publishGroupCallRecordingState(room, false);
    }
  }, [recording.phase]);

  const saveRecording = useCallback(async () => {
    const service = recordingServiceRef.current;
    if (!service) return;
    await service.savePending();
  }, []);

  const discardRecording = useCallback(() => {
    recordingServiceRef.current?.discardPending();
  }, []);

  const clearRecordingError = useCallback(() => {
    recordingServiceRef.current?.clearError();
  }, []);

  const clearMediaErrorBanner = useCallback(() => {
    setMediaErrorBanner(null);
  }, []);

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
        if (participants.length === 0) {
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
      recordingServiceRef.current?.dispose();
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
      setParticipantVolume,
      getParticipantVolume,
      unlockAudioPlayback,
      isInCallForChat,
      recording,
      recordingSupported: isCallRecordingSupported(),
      remoteRecording,
      startRecording,
      stopRecording,
      saveRecording,
      discardRecording,
      clearRecordingError,
      mediaErrorBanner,
      clearMediaErrorBanner,
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
      setParticipantVolume,
      getParticipantVolume,
      unlockAudioPlayback,
      isInCallForChat,
      recording,
      remoteRecording,
      startRecording,
      stopRecording,
      saveRecording,
      discardRecording,
      clearRecordingError,
      mediaErrorBanner,
      clearMediaErrorBanner,
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
