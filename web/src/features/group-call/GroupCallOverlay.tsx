import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionState, Track } from 'livekit-client';
import {
  useGroupCall,
  SCREEN_SHARE_QUALITY_OPTIONS,
  type GroupCallParticipant,
  type ScreenShareQuality,
} from '@/contexts/GroupCallContext';
import { ParticipantStage } from './ParticipantStage';
import { FullscreenStage } from './FullscreenStage';
import { LiveKitVideoRenderer } from './LiveKitVideoRenderer';
import {
  IconChevronDown,
  IconHangup,
  IconMic,
  IconMicOff,
  IconRecord,
  IconRecordStop,
  IconScreenShare,
  IconScreenShareOff,
  IconVideo,
  IconVideoOff,
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

type ActionTone = 'neutral' | 'accent' | 'danger' | 'disabled' | 'record' | 'recording' | 'off';

type ActionButtonProps = {
  label: string;
  tone?: ActionTone;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
};

function ActionButton({ label, tone = 'neutral', onClick, children, className }: ActionButtonProps) {
  return (
    <button
      type="button"
      className={`group-call-action group-call-action--${tone}${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
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
    screenShareQuality,
    setScreenShareQuality,
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
  const [fullscreenUserId, setFullscreenUserId] = useState<string | null>(null);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const qualityMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!qualityMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) {
        setQualityMenuOpen(false);
        return;
      }
      if (qualityMenuRef.current?.contains(target)) return;
      setQualityMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQualityMenuOpen(false);
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [qualityMenuOpen]);

  useEffect(() => {
    if (!callVisible) setQualityMenuOpen(false);
  }, [callVisible]);

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
        'Выйти из звонка?\n\nНажмите OK — выйти.\nОтмена — остаться.\n\nЧтобы завершить для всех, используйте ссылку «Завершить для всех» под панелью управления.',
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

  const onQualitySelect = useCallback(
    (quality: ScreenShareQuality) => {
      setQualityMenuOpen(false);
      void setScreenShareQuality(quality);
    },
    [setScreenShareQuality],
  );

  const isParticipantScreenSharing = useCallback(
    (participant: GroupCallParticipant) => {
      if (participant.isLocal) {
        return localCameraTrack?.source === Track.Source.ScreenShare;
      }
      return remoteVideoTracks[participant.userId]?.source === Track.Source.ScreenShare;
    },
    [localCameraTrack, remoteVideoTracks],
  );

  // Auto-exit fullscreen once the presenter stops sharing their screen or leaves.
  useEffect(() => {
    if (!fullscreenUserId) return;
    const participant = state.participants.find((p) => p.userId === fullscreenUserId);
    if (!participant || !isParticipantScreenSharing(participant)) {
      setFullscreenUserId(null);
    }
  }, [fullscreenUserId, state.participants, isParticipantScreenSharing]);

  const renderVideoSlot = useCallback(
    (participant: (typeof state.participants)[number]) => {
      if (!participant.isVideoEnabled) return undefined;
      if (participant.isLocal) {
        if (!localCameraTrack) return undefined;
        const isScreenShare = localCameraTrack.source === Track.Source.ScreenShare;
        // Avoid hall-of-mirrors: never render the local screen-share MediaStream.
        if (isScreenShare) {
          return (
            <div className="group-call-tile__self-share-placeholder">
              Вы демонстрируете экран
            </div>
          );
        }
        return (
          <LiveKitVideoRenderer
            track={localCameraTrack}
            mirror
            className="group-call-tile__video group-call-tile__video--mirror"
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

  // Must stay above early return — React hook order must be stable across renders.
  const handleOverlayPointerDown = useCallback(() => {
    if (!state.audioPlaybackBlocked) return;
    void unlockAudioPlayback();
  }, [state.audioPlaybackBlocked, unlockAudioPlayback]);

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

  const micLabel = state.isMuted ? 'Микрофон выкл' : 'Микрофон вкл';
  const camLabel = state.isVideoEnabled ? 'Камера вкл' : 'Камера выкл';
  const screenLabel = state.isScreenShareEnabled
    ? 'Остановить демонстрацию экрана'
    : 'Демонстрация экрана';
  const recordLabel = !recordingSupported
    ? 'Запись не поддерживается'
    : isRecordingActive
      ? 'Остановить запись'
      : recording.phase === 'requesting'
        ? 'Подготовка записи'
        : 'Запись';
  const isPresentingFullscreen = Boolean(fullscreenUserId);

  return (
    <div
      className={`group-call-overlay${savePromptVisible && !callVisible ? ' group-call-overlay--save-only' : ''}${isPresentingFullscreen ? ' group-call-overlay--presenting' : ''}${state.audioPlaybackBlocked ? ' group-call-overlay--audio-blocked' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Голосовой чат"
      onPointerDownCapture={handleOverlayPointerDown}
    >
      {callVisible ? (
        <>
          <div className="group-call-overlay__header">
            {!isPresentingFullscreen ? (
              <h2 className="group-call-overlay__title">{state.chatTitle}</h2>
            ) : null}
            <p className="group-call-overlay__subtitle">{statusLine}</p>
            {state.audioPlaybackBlocked ? (
              <button
                type="button"
                className="group-call-overlay__audio-unlock"
                onClick={(e) => {
                  e.stopPropagation();
                  void unlockAudioPlayback();
                }}
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
                title="Закрыть"
                onClick={() => {
                  if (recording.error || recording.warning) clearRecordingError();
                  if (mediaErrorBanner) clearMediaErrorBanner();
                }}
              >
                ×
              </button>
            </div>
          ) : null}

          {fullscreenUserId ? (
            <FullscreenStage
              participants={state.participants}
              fullscreenUserId={fullscreenUserId}
              renderVideoSlot={renderVideoSlot}
              onExitFullscreen={() => setFullscreenUserId(null)}
            />
          ) : (
            <ParticipantStage
              participants={state.participants}
              renderVideoSlot={renderVideoSlot}
              volumeUserId={volumeUserId}
              getParticipantVolume={getParticipantVolume}
              onParticipantVolumeChange={setParticipantVolume}
              onVolumeUserIdChange={setVolumeUserId}
              isParticipantScreenSharing={isParticipantScreenSharing}
              onFullscreenToggle={setFullscreenUserId}
            />
          )}

          <div className="group-call-overlay__controls">
            <div className="group-call-controls-row">
              <div className="group-call-capsule" role="toolbar" aria-label="Управление звонком">
                <ActionButton
                  label={micLabel}
                  tone={!canToggleMedia ? 'disabled' : state.isMuted ? 'off' : 'neutral'}
                  onClick={() => void toggleMute()}
                >
                  {state.isMuted ? <IconMicOff /> : <IconMic />}
                </ActionButton>

                <span className="group-call-capsule__sep" aria-hidden />

                <ActionButton
                  label={camLabel}
                  tone={
                    !canToggleMedia
                      ? 'disabled'
                      : state.isVideoEnabled
                        ? 'accent'
                        : 'off'
                  }
                  onClick={() => void toggleVideo()}
                >
                  {state.isVideoEnabled ? <IconVideo /> : <IconVideoOff />}
                </ActionButton>

                <span className="group-call-capsule__sep" aria-hidden />

                <div className="group-call-screen-wrap" ref={qualityMenuRef}>
                  <div className="group-call-screen-cluster">
                    <ActionButton
                      label={screenLabel}
                      tone={
                        !canToggleMedia
                          ? 'disabled'
                          : state.isScreenShareEnabled
                            ? 'accent'
                            : 'neutral'
                      }
                      className="group-call-action--screen-main"
                      onClick={() => void toggleScreenShare()}
                    >
                      {state.isScreenShareEnabled ? <IconScreenShareOff /> : <IconScreenShare />}
                    </ActionButton>
                    <button
                      type="button"
                      className={`group-call-screen-quality-btn${!canToggleMedia ? ' group-call-screen-quality-btn--disabled' : ''}`}
                      aria-label="Качество"
                      title="Качество"
                      aria-haspopup="menu"
                      aria-expanded={qualityMenuOpen}
                      disabled={!canToggleMedia}
                      onClick={(e) => {
                        e.stopPropagation();
                        setQualityMenuOpen((open) => !open);
                      }}
                    >
                      <IconChevronDown size={14} />
                    </button>
                  </div>
                  {qualityMenuOpen ? (
                    <div className="group-call-quality-menu" role="menu" aria-label="Качество демонстрации">
                      {SCREEN_SHARE_QUALITY_OPTIONS.map((option) => {
                        const selected = option.id === screenShareQuality;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={selected}
                            title={`${option.label}. ${option.hint}`}
                            aria-label={`${option.label}. ${option.hint}`}
                            className={`group-call-quality-menu__item${selected ? ' group-call-quality-menu__item--active' : ''}`}
                            onClick={() => onQualitySelect(option.id)}
                          >
                            <span className="group-call-quality-menu__label">{option.label}</span>
                            <span className="group-call-quality-menu__hint">{option.hint}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <span className="group-call-capsule__sep" aria-hidden />

                <div className="group-call-record-wrap">
                  <ActionButton
                    label={recordLabel}
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
                  ) : null}
                </div>
              </div>

              <ActionButton
                label="Завершить звонок"
                tone="danger"
                className="group-call-action--hangup"
                onClick={confirmLeave}
              >
                <IconHangup />
              </ActionButton>
            </div>

            {state.isCreator ? (
              <button
                type="button"
                className="group-call-overlay__end-all"
                title="Завершить для всех"
                aria-label="Завершить для всех"
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
              {recording.pendingFilename ?? 'Запись звонка.mp4'}
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
