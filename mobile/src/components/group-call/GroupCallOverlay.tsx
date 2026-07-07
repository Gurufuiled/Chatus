import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConnectionState, Track } from 'livekit-client';
import { VideoView } from '@livekit/react-native';
import { TelegramGlyph, TELEGRAM_CALL_GLYPHS } from '../../icons/telegram';
import { useGroupCall } from '../../contexts/GroupCallContext';
import { colors, withAlpha } from '../../theme/colors';
import { useTheme } from '../../contexts/ThemeContext';
import { ParticipantStage } from './ParticipantStage';

function formatDuration(startedAt?: number, now = Date.now()) {
  if (!startedAt) return 'Подключение...';
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

type ActionButtonProps = {
  accessibilityLabel: string;
  icon: keyof typeof TELEGRAM_CALL_GLYPHS;
  tone?: 'neutral' | 'accent' | 'danger' | 'disabled';
  onPress: () => void;
  onLongPress?: () => void;
};

function ActionButton({
  accessibilityLabel,
  icon,
  tone = 'neutral',
  onPress,
  onLongPress,
}: ActionButtonProps) {
  const { colors: themeColors } = useTheme();
  const bg =
    tone === 'danger'
      ? '#E53935'
      : tone === 'accent'
        ? withAlpha(themeColors.accent, 0.92)
        : tone === 'disabled'
          ? withAlpha(colors.textPrimary, 0.08)
          : withAlpha(colors.textPrimary, 0.14);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={tone === 'disabled'}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor: bg, opacity: tone === 'disabled' ? 0.55 : 1 },
        pressed && tone !== 'disabled' && styles.pressed,
      ]}
    >
      <TelegramGlyph
        d={TELEGRAM_CALL_GLYPHS[icon].d}
        fillRule={TELEGRAM_CALL_GLYPHS[icon].fillRule}
        viewBox={TELEGRAM_CALL_GLYPHS[icon].viewBox}
        size={26}
        color="#fff"
      />
    </Pressable>
  );
}

export function GroupCallOverlay() {
  const insets = useSafeAreaInsets();
  const {
    state,
    localCameraTrack,
    remoteVideoTracks,
    minimize,
    leaveGroupCall,
    endGroupCallForAll,
    toggleMute,
    toggleSpeaker,
    toggleVideo,
  } = useGroupCall();
  const [now, setNow] = useState(Date.now());

  const visible =
    state.phase === 'creating' ||
    state.phase === 'joining' ||
    state.phase === 'active';

  useEffect(() => {
    if (!visible || !state.startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible, state.startedAt]);

  const canToggleVideo = state.connectionState === ConnectionState.Connected;

  const statusLine = useMemo(() => {
    const isConnecting =
      (state.phase === 'creating' || state.phase === 'joining') &&
      state.connectionState !== ConnectionState.Connected;
    if (isConnecting) {
      return 'Подключение...';
    }
    if (state.connectionState !== ConnectionState.Connected) {
      return 'Пытаемся переподключиться...';
    }
    const count = Math.max(state.participants.length, 1);
    return `${count} участник${count === 1 ? '' : count < 5 ? 'а' : 'ов'} · ${formatDuration(state.startedAt, now)}`;
  }, [now, state.connectionState, state.participants.length, state.phase, state.startedAt]);

  const confirmLeave = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: state.isCreator
            ? ['Отмена', 'Выйти', 'Завершить для всех']
            : ['Отмена', 'Выйти'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: state.isCreator ? 2 : 1,
        },
        (index) => {
          if (index === 1) void leaveGroupCall();
          if (index === 2 && state.isCreator) void endGroupCallForAll();
        },
      );
      return;
    }
    if (state.isCreator) {
      Alert.alert('Голосовой чат', 'Что сделать?', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выйти', onPress: () => void leaveGroupCall() },
        {
          text: 'Завершить для всех',
          style: 'destructive',
          onPress: () => void endGroupCallForAll(),
        },
      ]);
      return;
    }
    Alert.alert('Выйти из звонка?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => void leaveGroupCall() },
    ]);
  };

  const renderVideoSlot = useCallback(
    (participant: (typeof state.participants)[number]) => {
      if (!participant.isVideoEnabled) {
        return undefined;
      }
      if (participant.isLocal) {
        if (!localCameraTrack) return undefined;
        const isScreenShare = localCameraTrack.source === Track.Source.ScreenShare;
        return (
          <VideoView
            videoTrack={localCameraTrack}
            style={[
              styles.participantVideo,
              isScreenShare ? styles.participantVideoContain : null,
            ]}
            objectFit={isScreenShare ? 'contain' : 'cover'}
            mirror={!isScreenShare}
          />
        );
      }
      const remoteTrack = remoteVideoTracks[participant.userId];
      if (!remoteTrack) return undefined;
      const isScreenShare = remoteTrack.source === Track.Source.ScreenShare;
      return (
        <VideoView
          videoTrack={remoteTrack}
          style={[
            styles.participantVideo,
            isScreenShare ? styles.participantVideoContain : null,
          ]}
          objectFit={isScreenShare ? 'contain' : 'cover'}
        />
      );
    },
    [localCameraTrack, remoteVideoTracks],
  );

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <Pressable onPress={minimize} style={styles.minimizeButton}>
          <Text style={styles.minimizeText}>▼ свернуть</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>
            {state.chatTitle}
          </Text>
          <Text style={styles.subtitle}>{statusLine}</Text>
        </View>

        <ParticipantStage participants={state.participants} renderVideoSlot={renderVideoSlot} />

        <View style={styles.controls}>
          <ActionButton
            accessibilityLabel={state.isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            icon={state.isMuted ? 'unmute' : 'mute'}
            onPress={() => {
              void toggleMute();
            }}
          />
          <ActionButton
            accessibilityLabel={state.isSpeakerOn ? 'Выключить динамик' : 'Включить динамик'}
            icon="speaker"
            onPress={() => {
              void toggleSpeaker();
            }}
          />
          <ActionButton
            accessibilityLabel={state.isVideoEnabled ? 'Выключить камеру' : 'Включить камеру'}
            icon="video"
            tone={
              !canToggleVideo ? 'disabled' : state.isVideoEnabled ? 'accent' : 'neutral'
            }
            onPress={() => {
              void toggleVideo();
            }}
          />
          <ActionButton
            accessibilityLabel="Завершить звонок"
            icon="hangup"
            tone="danger"
            onPress={confirmLeave}
            onLongPress={state.isCreator ? () => void endGroupCallForAll() : undefined}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0E1116',
    overflow: 'visible',
  },
  minimizeButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  minimizeText: {
    color: '#fff',
    fontSize: 15,
    opacity: 0.85,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    color: withAlpha('#fff', 0.72),
    fontSize: 15,
  },
  participantVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  participantVideoContain: {
    backgroundColor: '#0A0D12',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  actionButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
