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
  type Participant,
} from 'livekit-client';
import { AudioSession } from '@livekit/react-native';
import { authStore } from '../stores/authStore';
import { useCall } from './CallContext';
import { resolveAvatarUrl } from '../config';
import {
  createGroupCall,
  endGroupCallForAll,
  fetchActiveGroupCall,
  joinGroupCall,
  leaveGroupCall,
  type ApiGroupCallParticipant,
  type ApiGroupCallRoom,
} from '../services/groupCallService';
import { GroupCallOverlay } from '../components/group-call/GroupCallOverlay';
import { GroupCallInviteSheet } from '../components/group-call/GroupCallInviteSheet';
import { WebSocketService } from '../services/WebSocketService';

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
};

type GroupCallState = {
  phase: GroupCallPhase;
  roomId: string | null;
  chatId: string | null;
  chatTitle: string;
  participants: GroupCallParticipant[];
  isMuted: boolean;
  isSpeakerOn: boolean;
  startedAt?: number;
  isCreator: boolean;
  connectionState: ConnectionState | 'idle';
};

type GroupCallContextType = {
  state: GroupCallState;
  activeRoomByChatId: Record<string, ApiGroupCallRoom | null>;
  inviteSheetVisible: boolean;
  setInviteSheetVisible: (visible: boolean) => void;
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
  };
}

function mapLiveKitParticipant(
  participant: Participant,
  currentUserId: string,
): GroupCallParticipant {
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  return {
    userId: participant.identity,
    displayName: participant.name || participant.identity,
    avatarUrl: null,
    isLocal: participant.identity === currentUserId,
    isMuted: micPub?.isMuted ?? !micPub?.isEnabled,
    isSpeaking: participant.isSpeaking,
  };
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

export function GroupCallProvider({ children }: { children: React.ReactNode }) {
  const { callState } = useCall();
  const [state, setState] = useState<GroupCallState>(initialState);
  const [activeRoomByChatId, setActiveRoomByChatId] = useState<
    Record<string, ApiGroupCallRoom | null>
  >({});
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

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
    await detachRoom();
    setState(initialState);
  }, [detachRoom]);

  const syncParticipantsFromRoom = useCallback((room: Room) => {
    const currentUserId = authStore.getState().user?.id;
    if (!currentUserId) return;
    const remote = [...room.remoteParticipants.values()].map((p) =>
      mapLiveKitParticipant(p, currentUserId),
    );
    const local = room.localParticipant
      ? [mapLiveKitParticipant(room.localParticipant, currentUserId)]
      : [];
    setState((prev) => ({
      ...prev,
      participants: [...local, ...remote],
    }));
  }, []);

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
      await Audio.setAudioModeAsync(buildCallAudioMode(true));
      await AudioSession.startAudioSession();

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.ParticipantDisconnected, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.TrackMuted, () => syncParticipantsFromRoom(room));
      room.on(RoomEvent.TrackUnmuted, () => syncParticipantsFromRoom(room));
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
        void (async () => {
          if (roomId) {
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
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (micErr) {
        await detachRoom();
        throw micErr instanceof Error ? micErr : new Error(String(micErr));
      }

      syncParticipantsFromRoom(room);
      setState({
        phase: room.state === ConnectionState.Connected ? 'active' : params.phase,
        roomId: params.roomId,
        chatId: params.chatId,
        chatTitle: params.chatTitle,
        participants: room.localParticipant
          ? [mapLiveKitParticipant(room.localParticipant, currentUserId)]
          : [],
        isMuted: false,
        isSpeakerOn: true,
        startedAt: params.startedAt,
        isCreator: params.isCreator,
        connectionState: room.state,
      });
    },
    [detachRoom, resetCallState, syncParticipantsFromRoom],
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
      setState((prev) => {
        if (prev.chatId !== chatId || prev.roomId !== roomId) return prev;
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
      setState((prev) => ({
        ...prev,
        phase: 'joining',
        chatId,
        chatTitle,
        roomId,
      }));
      try {
        const response = await joinGroupCall(roomId);
        setActiveRoomByChatId((prev) => ({ ...prev, [chatId]: response.room }));
        const currentUserId = authStore.getState().user?.id;
        await connectToRoom({
          token: response.token,
          livekitUrl: response.livekit_url,
          roomName: response.room_name,
          chatId,
          chatTitle,
          roomId,
          startedAt: response.room.started_at,
          isCreator: currentUserId === response.room.started_by_user_id,
          phase: 'joining',
        });
      } catch (err) {
        await resetCallState();
        Alert.alert(
          'Не удалось присоединиться',
          err instanceof Error ? err.message : String(err),
        );
      }
    },
    [callState, connectToRoom, resetCallState],
  );

  const leaveGroupCallAction = useCallback(async () => {
    const roomId = stateRef.current.roomId;
    const chatId = stateRef.current.chatId;
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
      setActiveRoomByChatId((prev) => ({ ...prev, [chatId]: prev[chatId] ?? null }));
    }
    await resetCallState();
  }, [resetCallState]);

  const endGroupCallForAllAction = useCallback(async () => {
    const roomId = stateRef.current.roomId;
    const chatId = stateRef.current.chatId;
    if (!roomId) return;
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
    await room.localParticipant.setMicrophoneEnabled(!nextMuted);
    setState((prev) => ({
      ...prev,
      isMuted: nextMuted,
      participants: prev.participants.map((p) =>
        p.isLocal ? { ...p, isMuted: nextMuted } : p,
      ),
    }));
  }, []);

  const toggleSpeaker = useCallback(async () => {
    const nextSpeakerOn = !stateRef.current.isSpeakerOn;
    await Audio.setAudioModeAsync(buildCallAudioMode(nextSpeakerOn));
    setState((prev) => ({ ...prev, isSpeakerOn: nextSpeakerOn }));
  }, []);

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
          typeof payload.started_at === 'number' ? payload.started_at : Date.now();
        const startedBy =
          typeof payload.started_by === 'string' ? payload.started_by : '';
        if (!chatId || !roomId) return;
        const room: ApiGroupCallRoom = {
          id: roomId,
          chat_id: chatId,
          livekit_room_name: '',
          started_by_user_id: startedBy,
          started_at: startedAt,
          participant_count: 1,
        };
        applyActiveRoomSnapshot(chatId, room);
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
      activeRoomByChatId,
      inviteSheetVisible,
      setInviteSheetVisible,
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
      isInCallForChat,
    }),
    [
      state,
      activeRoomByChatId,
      inviteSheetVisible,
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
      isInCallForChat,
    ],
  );

  return (
    <GroupCallContext.Provider value={contextValue}>
      {children}
      <GroupCallOverlay />
      <GroupCallInviteSheet />
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
