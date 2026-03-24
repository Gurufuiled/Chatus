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

type VoicePlayerControls = {
  play: (uri: string, positionMs?: number) => Promise<void>;
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
  fallbackDurationMs: number
): VoicePlaybackForUri {
  const isCurrent = Boolean(uri) && snapshot.currentVoiceUri === uri;
  const positionMs = isCurrent ? snapshot.status.positionMs : 0;
  const durationMs = isCurrent
    ? Math.max(snapshot.status.durationMs, fallbackDurationMs)
    : fallbackDurationMs;
  const progress = isCurrent && durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;

  return {
    isCurrent,
    isPlaying: isCurrent && snapshot.status.isPlaying,
    progress,
    positionMs,
    remainingMs: isCurrent ? Math.max(fallbackDurationMs - positionMs, 0) : fallbackDurationMs,
    rate: snapshot.status.rate,
  };
}

function isSameVoicePlaybackSelection(
  prev: VoicePlaybackForUri,
  next: VoicePlaybackForUri
) {
  return (
    prev.isCurrent === next.isCurrent &&
    prev.isPlaying === next.isPlaying &&
    prev.progress === next.progress &&
    prev.positionMs === next.positionMs &&
    prev.remainingMs === next.remainingMs &&
    prev.rate === next.rate
  );
}

export function VoicePlayerProvider({ children }: { children: React.ReactNode }) {
  const play = useCallback(async (uri: string, positionMs?: number) => {
    await VoicePlayerService.play(uri, positionMs);
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
  fallbackDurationMs: number
): VoicePlaybackForUri {
  const [selection, setSelection] = useState<VoicePlaybackForUri>(() =>
    buildVoicePlaybackSelection(getVoicePlayerSnapshot(), uri, fallbackDurationMs)
  );
  const selectionRef = useRef(selection);

  useEffect(() => {
    const syncSelection = () => {
      const next = buildVoicePlaybackSelection(
        getVoicePlayerSnapshot(),
        uri,
        fallbackDurationMs
      );

      if (isSameVoicePlaybackSelection(selectionRef.current, next)) {
        return;
      }

      selectionRef.current = next;
      setSelection(next);
    };

    syncSelection();
    return subscribeToVoicePlayer(syncSelection);
  }, [fallbackDurationMs, uri]);

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
