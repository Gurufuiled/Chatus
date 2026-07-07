import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionState, Track } from 'livekit-client';
import { useGroupCall } from '@/contexts/GroupCallContext';
import { ParticipantStage } from './ParticipantStage';
import { LiveKitVideoRenderer } from './LiveKitVideoRenderer';
import {
  IconHangup,
  IconMic,
  IconMicOff,
  IconScreenShare,
  IconScreenShareOff,
  IconVideo,
  IconVolume,
} from './callIcons';
import './group-call.css';

function formatDuration(startedAt?: number, now = Date.now()) {
  if (!startedAt) return 'Подключение...';
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

type ActionButtonProps = {
  label: string;
  tone?: 'neutral' | 'accent' | 'danger' | 'disabled';
  onClick: () => void;
  children: React.ReactNode;
};

function ActionButton({ label, tone = 'neutral', onClick, children }: ActionButtonProps) {
  return (
    <button
      type="button"
      className={`group-call-action group-call-action--${tone}`}
      aria-label={label}
      disabled={tone === 'disabled'}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function RemoteVolumeControl({
  volume,
  onChange,
}: {
  volume: number;
  onChange: (volume: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const percent = Math.round(volume * 100);

  return (
    <div className="group-call-volume-wrap" ref={wrapRef}>
      <ActionButton
        label="Громкость собеседников"
        tone={open ? 'accent' : 'neutral'}
        onClick={() => setOpen((v) => !v)}
      >
        <IconVolume />
      </ActionButton>
      {open ? (
        <div className="group-call-volume-popover" role="dialog" aria-label="Громкость собеседников">
          <span className="group-call-volume-popover__label">Громкость · {percent}%</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={percent}
            className="group-call-volume-popover__slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            onChange={(e) => onChange(Number(e.target.value) / 100)}
          />
        </div>
      ) : null}
    </div>
  );
}

export function GroupCallOverlay() {
  const {
    state,
    localCameraTrack,
    remoteVideoTracks,
    leaveGroupCall,
    endGroupCallForAll,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    setRemoteVolume,
  } = useGroupCall();
  const [now, setNow] = useState(Date.now());

  const visible =
    state.phase === 'creating' || state.phase === 'joining' || state.phase === 'active';

  useEffect(() => {
    if (!visible || !state.startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [visible, state.startedAt]);

  const canToggleMedia = state.connectionState === ConnectionState.Connected;

  const statusLine = useMemo(() => {
    const isConnecting =
      (state.phase === 'creating' || state.phase === 'joining') &&
      state.connectionState !== ConnectionState.Connected;
    if (isConnecting) return 'Подключение...';
    if (state.connectionState !== ConnectionState.Connected) {
      return 'Пытаемся переподключиться...';
    }
    const count = Math.max(state.participants.length, 1);
    return `${count} участник${count === 1 ? '' : count < 5 ? 'а' : 'ов'} · ${formatDuration(state.startedAt, now)}`;
  }, [now, state.connectionState, state.participants.length, state.phase, state.startedAt]);

  const confirmLeave = () => {
    if (state.isCreator) {
      const choice = window.confirm(
        'Выйти из звонка?\n\nНажмите OK — выйти.\nОтмена — остаться.\n\nЧтобы завершить для всех, используйте кнопку «Завершить для всех» в меню.',
      );
      if (choice) void leaveGroupCall();
      return;
    }
    if (window.confirm('Выйти из звонка?')) {
      void leaveGroupCall();
    }
  };

  const renderVideoSlot = useCallback(
    (participant: (typeof state.participants)[number]) => {
      if (!participant.isVideoEnabled) return undefined;
      if (participant.isLocal) {
        if (!localCameraTrack) return undefined;
        const isScreenShare = localCameraTrack.source === Track.Source.ScreenShare;
        return (
          <LiveKitVideoRenderer
            track={localCameraTrack}
            mirror={!isScreenShare}
            className={`group-call-tile__video${isScreenShare ? ' group-call-tile__video--contain' : ' group-call-tile__video--mirror'}`}
          />
        );
      }
      const remoteTrack = remoteVideoTracks[participant.userId];
      if (!remoteTrack) return undefined;
      const isScreenShare = remoteTrack.source === Track.Source.ScreenShare;
      return (
        <LiveKitVideoRenderer
          track={remoteTrack}
          className={`group-call-tile__video${isScreenShare ? ' group-call-tile__video--contain' : ''}`}
        />
      );
    },
    [localCameraTrack, remoteVideoTracks],
  );

  if (!visible) return null;

  return (
    <div className="group-call-overlay" role="dialog" aria-modal="true" aria-label="Голосовой чат">
      <div className="group-call-overlay__header">
        <h2 className="group-call-overlay__title">{state.chatTitle}</h2>
        <p className="group-call-overlay__subtitle">{statusLine}</p>
      </div>

      <ParticipantStage participants={state.participants} renderVideoSlot={renderVideoSlot} />

      <div className="group-call-overlay__controls">
        <ActionButton
          label={state.isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
          tone={!canToggleMedia ? 'disabled' : 'neutral'}
          onClick={() => void toggleMute()}
        >
          {state.isMuted ? <IconMicOff /> : <IconMic />}
        </ActionButton>

        <RemoteVolumeControl volume={state.remoteVolume} onChange={setRemoteVolume} />

        <ActionButton
          label={state.isVideoEnabled ? 'Выключить камеру' : 'Включить камеру'}
          tone={!canToggleMedia ? 'disabled' : state.isVideoEnabled ? 'accent' : 'neutral'}
          onClick={() => void toggleVideo()}
        >
          <IconVideo />
        </ActionButton>

        <ActionButton
          label={
            state.isScreenShareEnabled
              ? 'Остановить демонстрацию экрана'
              : 'Демонстрация экрана'
          }
          tone={
            !canToggleMedia ? 'disabled' : state.isScreenShareEnabled ? 'accent' : 'neutral'
          }
          onClick={() => void toggleScreenShare()}
        >
          {state.isScreenShareEnabled ? <IconScreenShareOff /> : <IconScreenShare />}
        </ActionButton>

        <ActionButton label="Завершить звонок" tone="danger" onClick={confirmLeave}>
          <IconHangup />
        </ActionButton>

        {state.isCreator ? (
          <button
            type="button"
            className="group-call-overlay__end-all"
            onClick={() => {
              if (window.confirm('Завершить голосовой чат для всех участников?')) {
                void endGroupCallForAll();
              }
            }}
          >
            Завершить для всех
          </button>
        ) : null}
      </div>
    </div>
  );
}
