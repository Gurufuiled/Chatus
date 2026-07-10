import {
  getVideoNotePlaybackSnapshot,
  stopActiveVideoNotePlayback,
} from './videoNotePlayerService';

export type VoicePlayerStatus = {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  rate: number;
};

export type VoicePlayerSnapshot = {
  currentVoiceUri: string | null;
  authorLabel: string | null;
  status: VoicePlayerStatus;
};

type Listener = () => void;

const PLAYBACK_RATES = [1, 1.5, 2] as const;

const IDLE_STATUS: VoicePlayerStatus = {
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  rate: 1,
};

let audio: HTMLAudioElement | null = null;
let currentUri: string | null = null;
let authorLabel: string | null = null;
let status: VoicePlayerStatus = { ...IDLE_STATUS };
let snapshot: VoicePlayerSnapshot = {
  currentVoiceUri: null,
  authorLabel: null,
  status,
};
let rafId: number | null = null;
const listeners = new Set<Listener>();

function rebuildSnapshot() {
  snapshot = {
    currentVoiceUri: currentUri,
    authorLabel,
    status,
  };
}

function emit() {
  rebuildSnapshot();
  listeners.forEach((listener) => listener());
}

function setStatus(partial: Partial<VoicePlayerStatus>) {
  status = { ...status, ...partial };
  emit();
}

function stopRaf() {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function tickProgress() {
  if (!audio || !currentUri) {
    stopRaf();
    return;
  }
  const dur =
    Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration * 1000
      : status.durationMs;
  const positionMs = Math.max(0, Math.min(audio.currentTime * 1000, dur || Infinity));
  if (
    Math.abs(positionMs - status.positionMs) >= 16 ||
    Math.abs(dur - status.durationMs) >= 1 ||
    status.isPlaying !== !audio.paused
  ) {
    setStatus({
      isPlaying: !audio.paused && !audio.ended,
      positionMs,
      durationMs: dur > 0 ? dur : status.durationMs,
    });
  }
  if (!audio.paused && !audio.ended) {
    rafId = requestAnimationFrame(tickProgress);
  } else {
    rafId = null;
  }
}

function startRaf() {
  if (rafId != null) return;
  rafId = requestAnimationFrame(tickProgress);
}

function detachAudio() {
  stopRaf();
  if (!audio) return;
  audio.onplay = null;
  audio.onpause = null;
  audio.onended = null;
  audio.onerror = null;
  audio.ontimeupdate = null;
  audio.onloadedmetadata = null;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  audio = null;
}

function ensureAudio(uri: string): HTMLAudioElement {
  if (audio && currentUri === uri) return audio;
  detachAudio();
  const next = new Audio(uri);
  next.preload = 'metadata';
  next.playbackRate = status.rate || 1;
  next.onplay = () => {
    setStatus({ isPlaying: true });
    startRaf();
  };
  next.onpause = () => {
    tickProgress();
    setStatus({ isPlaying: false });
    stopRaf();
  };
  next.onended = () => {
    stopRaf();
    setStatus({ isPlaying: false, positionMs: 0 });
  };
  next.onerror = () => {
    void VoicePlayerService.stop();
  };
  next.onloadedmetadata = () => {
    if (Number.isFinite(next.duration) && next.duration > 0) {
      setStatus({ durationMs: next.duration * 1000 });
    }
  };
  next.ontimeupdate = () => {
    tickProgress();
  };
  audio = next;
  currentUri = uri;
  emit();
  return next;
}

export const VoicePlayerService = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): VoicePlayerSnapshot {
    return snapshot;
  },

  async play(uri: string, options?: { positionMs?: number; authorLabel?: string | null; durationMs?: number }) {
    if (getVideoNotePlaybackSnapshot().messageId) {
      stopActiveVideoNotePlayback();
    }

    if (options?.authorLabel !== undefined) {
      authorLabel = options.authorLabel;
    }
    if (options?.durationMs && options.durationMs > 0 && (!status.durationMs || currentUri !== uri)) {
      status = { ...status, durationMs: options.durationMs };
    }

    const el = ensureAudio(uri);
    if (options?.positionMs != null && Number.isFinite(options.positionMs)) {
      const applySeek = () => {
        el.currentTime = Math.max(0, options.positionMs! / 1000);
      };
      if (Number.isFinite(el.duration) && el.duration > 0) {
        applySeek();
      } else {
        el.addEventListener('loadedmetadata', applySeek, { once: true });
      }
    }
    el.playbackRate = status.rate || 1;
    try {
      await el.play();
      startRaf();
    } catch {
      setStatus({ isPlaying: false });
      stopRaf();
    }
  },

  async pause() {
    if (!audio) return;
    audio.pause();
    setStatus({ isPlaying: false });
    stopRaf();
  },

  async stop() {
    detachAudio();
    currentUri = null;
    authorLabel = null;
    status = { ...IDLE_STATUS, rate: status.rate || 1 };
    emit();
  },

  async seekTo(positionMs: number) {
    if (!audio) return;
    const apply = () => {
      if (!audio) return;
      const dur =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : status.durationMs / 1000;
      const next = Math.max(0, Math.min(positionMs / 1000, dur || 0));
      audio.currentTime = next;
      setStatus({ positionMs: next * 1000 });
    };
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      apply();
    } else {
      audio.addEventListener('loadedmetadata', apply, { once: true });
    }
  },

  async setPlaybackRate(rate: number) {
    const next = PLAYBACK_RATES.find((r) => Math.abs(r - rate) < 0.01) ?? 1;
    status = { ...status, rate: next };
    if (audio) {
      audio.playbackRate = next;
    }
    emit();
  },

  cyclePlaybackRate() {
    const currentIndex = PLAYBACK_RATES.findIndex((rate) => Math.abs(rate - (status.rate || 1)) < 0.01);
    const nextRate = PLAYBACK_RATES[(currentIndex + 1 + PLAYBACK_RATES.length) % PLAYBACK_RATES.length];
    void this.setPlaybackRate(nextRate);
  },

  formatRateLabel(rate = status.rate || 1): string {
    const normalized =
      Math.abs(rate - Math.round(rate)) < 0.001 ? Math.round(rate).toString() : rate.toFixed(1);
    return `${normalized}x`;
  },
};
