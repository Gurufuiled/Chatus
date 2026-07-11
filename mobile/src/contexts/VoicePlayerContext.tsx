import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  VoicePlayerService,
  type VoicePlayerSnapshot,
  type VoicePlayerStatus,
} from '../services/VoicePlayerService';
import { normalizeVoicePlaybackKey } from '../utils/voicePlaybackKey';

type VoicePlayerControls = {
  play: (uri: string, positionMs?: number, playbackKey?: string) => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  setPlaybackRate: (rate: number) => Promise<void>;
};

type VoicePlaybackForUri = {
  isCurrent: boolean;
  isPlaying: boolean;
  progress: number;
  positionMs: number;
  remainingMs: number;
  rate: number;
};

const VoicePlayerContext = createContext<VoicePlayerControls | null>(null);

function subscribeToVoicePlayer(onStoreChange: () => void) {
  return VoicePlayerService.subscribe(onStoreChange);
}

function getVoicePlayerSnapshot(): VoicePlayerSnapshot {
  return VoicePlayerService.getSnapshot();
}

function buildVoicePlaybackSelection(
  snapshot: VoicePlayerSnapshot,
  uri: string | null,
  fallbackDurationMs: number,
  playbackKey?: string
): VoicePlaybackForUri {
  const candidateKeys = [playbackKey, uri]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => normalizeVoicePlaybackKey(value));
  const isCurrent =
    Boolean(snapshot.currentVoiceUri) &&
    candidateKeys.some((key) => key === snapshot.currentVoiceUri);
  const positionMs = isCurrent ? snapshot.status.positionMs : 0;
  /** Use loaded media duration for progress — message metadata can be inflated (e.g. recording wall-clock bug). */
  const durationMs = isCurrent
    ? snapshot.status.durationMs > 0
      ? snapshot.status.durationMs
      : fallbackDurationMs
    : fallbackDurationMs;
  const effectiveDurationMs = durationMs > 0 ? durationMs : fallbackDurationMs;
  const progress =
    isCurrent && effectiveDurationMs > 0
      ? Math.min(positionMs / effectiveDurationMs, 1)
      : 0;

  return {
    isCurrent,
    isPlaying: isCurrent && snapshot.status.isPlaying,
    progress,
    positionMs,
    // remainingMs: use ceil-friendly calculation so it reaches 0 naturally
    remainingMs: isCurrent ? Math.max(effectiveDurationMs - positionMs, 0) : fallbackDurationMs,
    rate: snapshot.status.rate,
  };
}

function isSameVoicePlaybackSelection(
  prev: VoicePlaybackForUri,
  next: VoicePlaybackForUri
) {
  if (prev.isCurrent !== next.isCurrent || prev.isPlaying !== next.isPlaying || prev.rate !== next.rate) {
    return false;
  }
  if (!next.isCurrent) {
    return true;
  }
  // Keep thresholds tight so long voice notes still advance the waveform while playing.
  // (Previously 200ms / 1.2% skipped most mid-playback ticks.)
  return (
    Math.abs(prev.progress - next.progress) < 0.003 &&
    Math.abs(prev.positionMs - next.positionMs) < 40 &&
    Math.abs(prev.remainingMs - next.remainingMs) < 40
  );
}

export function VoicePlayerProvider({ children }: { children: React.ReactNode }) {
  const play = useCallback(async (uri: string, positionMs?: number, playbackKey?: string) => {
    await VoicePlayerService.play(uri, positionMs, playbackKey);
  }, []);

  const pause = useCallback(async () => {
    await VoicePlayerService.pause();
  }, []);

  const stop = useCallback(async () => {
    await VoicePlayerService.stop();
  }, []);

  const seekTo = useCallback(async (positionMs: number) => {
    await VoicePlayerService.seekTo(positionMs);
  }, []);

  const setPlaybackRate = useCallback(async (rate: number) => {
    await VoicePlayerService.setPlaybackRate(rate);
  }, []);

  const value = useMemo<VoicePlayerControls>(
    () => ({
      play,
      pause,
      stop,
      seekTo,
      setPlaybackRate,
    }),
    [pause, play, seekTo, setPlaybackRate, stop]
  );

  useEffect(() => {
    return () => {
      void VoicePlayerService.stop().catch(() => {});
    };
  }, []);

  return (
    <VoicePlayerContext.Provider value={value}>
      {children}
    </VoicePlayerContext.Provider>
  );
}

export function useVoicePlayerControls(): VoicePlayerControls {
  const ctx = useContext(VoicePlayerContext);
  if (!ctx) {
    throw new Error('useVoicePlayerControls must be used within VoicePlayerProvider');
  }
  return ctx;
}

export function useVoicePlayerState(): VoicePlayerSnapshot {
  return useSyncExternalStore(
    subscribeToVoicePlayer,
    getVoicePlayerSnapshot,
    getVoicePlayerSnapshot
  );
}

export function useVoicePlaybackForUri(
  uri: string | null,
  fallbackDurationMs: number,
  playbackKey?: string
): VoicePlaybackForUri {
  const effectivePlaybackKey = playbackKey ?? uri ?? undefined;
  const [selection, setSelection] = useState<VoicePlaybackForUri>(() =>
    buildVoicePlaybackSelection(getVoicePlayerSnapshot(), uri, fallbackDurationMs, effectivePlaybackKey)
  );
  const selectionRef = useRef(selection);

  useEffect(() => {
    const syncSelection = () => {
      const next = buildVoicePlaybackSelection(
        getVoicePlayerSnapshot(),
        uri,
        fallbackDurationMs,
        effectivePlaybackKey
      );

      if (isSameVoicePlaybackSelection(selectionRef.current, next)) {
        return;
      }

      selectionRef.current = next;
      setSelection(next);
    };

    syncSelection();
    return subscribeToVoicePlayer(syncSelection);
  }, [effectivePlaybackKey, fallbackDurationMs, uri]);

  return selection;
}

export function useVoicePlayer(): VoicePlayerControls & {
  currentVoiceUri: string | null;
  status: VoicePlayerStatus;
} {
  const controls = useVoicePlayerControls();
  const snapshot = useVoicePlayerState();

  return {
    ...controls,
    currentVoiceUri: snapshot.currentVoiceUri,
    status: snapshot.status,
  };
}
