import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConnectionState, Track } from 'livekit-client';
import { useGroupCall } from '@/contexts/GroupCallContext';
import { ParticipantStage } from './ParticipantStage';
import { LiveKitVideoRenderer } from './LiveKitVideoRenderer';
import {
  IconHangup,
  IconMic,
  IconMicOff,
  IconRecord,
  IconRecordStop,
  IconScreenShare,
  IconScreenShareOff,
  IconVideo,
} from './callIcons';
import './group-call.css';

function formatDuration(startedAt?: number, now = Date.now()) {
  if (!startedAt) return 'Подключение...';
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatRecordingElapsed(startedAt: number | null, now: number): string {
  if (!startedAt) return '0:00';
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

type ActionButtonProps = {
  label: string;
  tone?: 'neutral' | 'accent' | 'danger' | 'disabled' | 'record' | 'recording';
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
    getParticipantVolume,
    setParticipantVolume,
    unlockAudioPlayback,
    recording,
    recordingSupported,
    remoteRecording,
    startRecording,
    stopRecording,
    saveRecording,
    discardRecording,
    clearRecordingError,
    mediaErrorBanner,
    clearMediaErrorBanner,
  } = useGroupCall();
  const [now, setNow] = useState(Date.now());
  const [volumeUserId, setVolumeUserId] = useState<string | null>(null);

  const callVisible =
    state.phase === 'creating' || state.phase === 'joining' || state.phase === 'active';
  const savePromptVisible = recording.phase === 'save_prompt';
  const visible = callVisible || savePromptVisible;

  useEffect(() => {
    if (!visible) return;
    const needsTick =
      Boolean(state.startedAt && callVisible) ||
      recording.phase === 'recording' ||
      recording.phase === 'stopping';
    if (!needsTick) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [visible, state.startedAt, callVisible, recording.phase]);

  useEffect(() => {
    if (!volumeUserId) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) {
        setVolumeUserId(null);
        return;
      }
      if (
        target.closest('.group-call-tile--clickable') ||
        target.closest('.group-call-tile-volume')
      ) {
        return;
      }
      setVolumeUserId(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVolumeUserId(null);
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [volumeUserId]);

  useEffect(() => {
    if (!volumeUserId) return;
    if (!state.participants.some((p) => p.userId === volumeUserId && !p.isLocal)) {
      setVolumeUserId(null);
    }
  }, [state.participants, volumeUserId]);

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

  const onRecordClick = useCallback(() => {
    if (recording.phase === 'recording') {
      void stopRecording();
      return;
    }
    if (recording.phase === 'idle') {
      void startRecording();
    }
  }, [recording.phase, startRecording, stopRecording]);

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

  const bannerText = recording.error || recording.warning || mediaErrorBanner;
  const isRecordingActive =
    recording.phase === 'recording' || recording.phase === 'stopping';
  const showRecordingBadge = isRecordingActive || remoteRecording.active;
  const recordingBadgeLabel =
    recording.phase === 'stopping'
      ? recording.warning === 'Обработка записи…'
        ? 'Обработка записи…'
        : 'Остановка записи…'
      : isRecordingActive
        ? 'Идёт запись'
        : remoteRecording.byDisplayName
          ? `Идёт запись · ${remoteRecording.byDisplayName}`
          : 'Идёт запись';
  const recordDisabled =
    !canToggleMedia ||
    !recordingSupported ||
    recording.phase === 'requesting' ||
    recording.phase === 'stopping' ||
    recording.phase === 'save_prompt';

  return (
    <div
      className={`group-call-overlay${savePromptVisible && !callVisible ? ' group-call-overlay--save-only' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Голосовой чат"
    >
      {callVisible ? (
        <>
          <div className="group-call-overlay__header">
            <h2 className="group-call-overlay__title">{state.chatTitle}</h2>
            <p className="group-call-overlay__subtitle">{statusLine}</p>
            {state.audioPlaybackBlocked ? (
              <button
                type="button"
                className="group-call-overlay__audio-unlock"
                onClick={() => void unlockAudioPlayback()}
              >
                Нажмите, чтобы включить звук собеседников
              </button>
            ) : null}
            {showRecordingBadge ? (
              <div className="group-call-recording-badge" role="status" aria-live="polite">
                <span className="group-call-recording-badge__dot" aria-hidden />
                <span>{recordingBadgeLabel}</span>
              </div>
            ) : null}
          </div>

          {bannerText ? (
            <div
              className={`group-call-banner-inline${recording.error || mediaErrorBanner ? ' group-call-banner-inline--error' : ' group-call-banner-inline--warn'}`}
              role="status"
            >
              <p className="group-call-banner-inline__text">{bannerText}</p>
              <button
                type="button"
                className="group-call-banner-inline__dismiss"
                aria-label="Закрыть"
                onClick={() => {
                  if (recording.error || recording.warning) clearRecordingError();
                  if (mediaErrorBanner) clearMediaErrorBanner();
                }}
              >
                ×
              </button>
            </div>
          ) : null}

          <ParticipantStage
            participants={state.participants}
            renderVideoSlot={renderVideoSlot}
            volumeUserId={volumeUserId}
            getParticipantVolume={getParticipantVolume}
            onParticipantVolumeChange={setParticipantVolume}
            onVolumeUserIdChange={setVolumeUserId}
          />

          <div className="group-call-overlay__controls">
            <ActionButton
              label={state.isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
              tone={!canToggleMedia ? 'disabled' : 'neutral'}
              onClick={() => void toggleMute()}
            >
              {state.isMuted ? <IconMicOff /> : <IconMic />}
            </ActionButton>

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

            <div className="group-call-record-wrap">
              <ActionButton
                label={
                  !recordingSupported
                    ? 'Запись не поддерживается'
                    : isRecordingActive
                      ? 'Остановить запись'
                      : recording.phase === 'requesting'
                        ? 'Подготовка записи'
                        : 'Записать'
                }
                tone={
                  recordDisabled
                    ? 'disabled'
                    : isRecordingActive
                      ? 'recording'
                      : 'record'
                }
                onClick={onRecordClick}
              >
                {isRecordingActive ? <IconRecordStop /> : <IconRecord />}
              </ActionButton>
              {isRecordingActive ? (
                <span className="group-call-record-timer" aria-live="polite">
                  {formatRecordingElapsed(recording.startedAt, now)}
                </span>
              ) : (
                <span className="group-call-record-label">Записать</span>
              )}
            </div>

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
        </>
      ) : null}

      {savePromptVisible ? (
        <div className="group-call-save-sheet" role="dialog" aria-label="Сохранить запись">
          <div className="group-call-save-sheet__card">
            <h3 className="group-call-save-sheet__title">Сохранить запись?</h3>
            <p className="group-call-save-sheet__subtitle">
              {recording.pendingFilename ?? 'Запись звонка.webm'}
            </p>
            {recording.error ? (
              <p className="group-call-save-sheet__error">{recording.error}</p>
            ) : null}
            <div className="group-call-save-sheet__actions">
              <button
                type="button"
                className="group-call-save-sheet__btn group-call-save-sheet__btn--ghost"
                onClick={discardRecording}
              >
                Удалить
              </button>
              <button
                type="button"
                className="group-call-save-sheet__btn group-call-save-sheet__btn--primary"
                onClick={() => void saveRecording()}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
