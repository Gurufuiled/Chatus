/**
 * VoicePlayerService - Plays voice messages using expo-av.
 * Single sound at a time. Loading new URI stops and unloads previous.
 */

import { Audio } from 'expo-av';
import type { AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

const PROGRESS_UPDATE_INTERVAL_MS = 100;

export interface VoicePlayerStatus {
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
  rate: number;
}

export interface VoicePlayerSnapshot {
  currentVoiceUri: string | null;
  status: VoicePlayerStatus;
}

export type VoicePlayerStatusListener = (status: VoicePlayerStatus) => void;
export type VoicePlayerStoreListener = () => void;

class VoicePlayerServiceClass {
  private soundRef: Audio.Sound | null = null;
  private playPromise: Promise<void> = Promise.resolve();
  private statusListeners = new Set<VoicePlayerStatusListener>();
  private storeListeners = new Set<VoicePlayerStoreListener>();
  private voiceCacheDir: string | null = null;
  private currentUri: string | null = null;
  private lastStatus: VoicePlayerStatus = {
    positionMs: 0,
    durationMs: 0,
    isPlaying: false,
    rate: 1,
  };
  private lastSnapshot: VoicePlayerSnapshot = {
    currentVoiceUri: null,
    status: {
      positionMs: 0,
      durationMs: 0,
      isPlaying: false,
      rate: 1,
    },
  };
  private playbackRate = 1;

  private async ensureVoiceCacheDir(): Promise<string> {
    if (this.voiceCacheDir) return this.voiceCacheDir;

    const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
    if (!base) {
      throw new Error('No cache directory available for voice playback');
    }

    const dir = `${base}${base.endsWith('/') ? '' : '/'}voice-playback-cache/`;
    const info = await FileSystem.getInfoAsync(dir).catch(() => null);
    if (!info?.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }

    this.voiceCacheDir = dir;
    return dir;
  }

  /** Short deterministic name — avoids Android path limits from encodeURIComponent(longUrl). */
  private hashUriForFilename(uri: string): string {
    let h = 5381;
    for (let i = 0; i < uri.length; i += 1) {
      h = ((h << 5) + h) ^ uri.charCodeAt(i);
    }
    const unsigned = h >>> 0;
    return `${unsigned.toString(16)}_${uri.length}`;
  }

  private getCachedVoicePath(uri: string, ext: string): Promise<string> {
    return this.ensureVoiceCacheDir().then((dir) => {
      const safeName = this.hashUriForFilename(uri);
      return `${dir}${safeName}.${ext}`;
    });
  }

  private async resolvePlayableUri(uri: string): Promise<string> {
    if (!/^https?:\/\//i.test(uri)) {
      return uri;
    }

    const extMatch = uri.match(/\.([a-z0-9]+)(?:\?|$)/i);
    const ext = extMatch?.[1]?.toLowerCase() ?? 'm4a';
    const localPath = await this.getCachedVoicePath(uri, ext);
    const info = await FileSystem.getInfoAsync(localPath).catch(() => null);
    if (info?.exists && !info.isDirectory) {
      const size =
        typeof (info as { size?: number }).size === 'number'
          ? (info as { size?: number }).size
          : undefined;
      if (size === undefined || size > 64) {
        return localPath;
      }
      await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
    }

    try {
      await FileSystem.downloadAsync(uri, localPath);
      return localPath;
    } catch {
      await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
      throw new Error(`Voice download failed for ${uri.slice(0, 120)}`);
    }
  }

  /** Ensure audio mode allows playback (plays in silent mode on iOS). */
  private async ensureAudioMode(): Promise<void> {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  }

  /** Stop and unload current sound if any. */
  private async stopAndUnloadCurrent(): Promise<void> {
    const sound = this.soundRef;
    if (!sound) return;

    try {
      await sound.unloadAsync();
    } catch {
      // Ignore unload errors (e.g. already unloaded)
    }
    this.soundRef = null;
    this.currentUri = null;
    this.lastStatus = { positionMs: 0, durationMs: 0, isPlaying: false, rate: this.playbackRate };
    this.notifyListeners();
  }

  private refreshSnapshot(): void {
    this.lastSnapshot = {
      currentVoiceUri: this.currentUri,
      status: { ...this.lastStatus },
    };
  }

  private notifyListeners(): void {
    this.refreshSnapshot();
    this.statusListeners.forEach((cb) => cb(this.lastSnapshot.status));
    this.storeListeners.forEach((cb) => cb());
  }

  addStatusListener(cb: VoicePlayerStatusListener): void {
    this.statusListeners.add(cb);
  }

  removeStatusListener(cb: VoicePlayerStatusListener): void {
    this.statusListeners.delete(cb);
  }

  subscribe(cb: VoicePlayerStoreListener): () => void {
    this.storeListeners.add(cb);
    return () => {
      this.storeListeners.delete(cb);
    };
  }

  private handlePlaybackStatusUpdate = (status: AVPlaybackStatus): void => {
    if (!status.isLoaded) return;

    if (status.didJustFinish) {
      const finalDurationMs = status.durationMillis ?? this.lastStatus.durationMs;
      this.lastStatus = {
        // Keep positionMs at the full duration so the timer shows 0:00 remaining
        // instead of jumping back to the total duration on the last tick.
        positionMs: finalDurationMs,
        durationMs: finalDurationMs,
        isPlaying: false,
        rate: status.rate ?? this.playbackRate,
      };
      void this.soundRef?.stopAsync().catch(() => {});
      this.notifyListeners();
      return;
    }

    this.lastStatus = {
      positionMs: status.positionMillis ?? 0,
      durationMs: status.durationMillis ?? 0,
      isPlaying: status.isPlaying ?? false,
      rate: status.rate ?? this.playbackRate,
    };
    this.notifyListeners();
  };

  /**
   * Load and play a voice message from URI.
   * Stops and unloads any previously playing sound.
   * Serialized to avoid race when play() is called concurrently.
   */
  async play(uri: string, positionMs?: number): Promise<void> {
    const previous = this.playPromise;
    this.playPromise = (async () => {
      await previous;

      if (this.soundRef && this.currentUri === uri) {
        const currentStatus = await this.soundRef.getStatusAsync();
        if (currentStatus.isLoaded) {
          if (positionMs != null) {
            const durationMs = currentStatus.durationMillis ?? this.lastStatus.durationMs ?? 0;
            const nextPosition = Math.max(0, Math.min(positionMs, durationMs));
            await this.soundRef.setPositionAsync(nextPosition);
          }
          if (!currentStatus.isPlaying) {
            const durationMs = currentStatus.durationMillis ?? 0;
            const currentPosition = positionMs ?? currentStatus.positionMillis ?? 0;
            if (durationMs > 0 && currentPosition >= durationMs - 80) {
              await this.soundRef.setPositionAsync(0);
            }
            await this.soundRef.playAsync();
            const resumedStatus = await this.soundRef.getStatusAsync();
            if (resumedStatus.isLoaded) {
              this.lastStatus = {
                positionMs: resumedStatus.positionMillis ?? 0,
                durationMs: resumedStatus.durationMillis ?? 0,
                isPlaying: resumedStatus.isPlaying ?? false,
                rate: resumedStatus.rate ?? this.playbackRate,
              };
              this.notifyListeners();
            }
          }
          return;
        }
      }

      await this.stopAndUnloadCurrent();
      await this.ensureAudioMode();
      const playableUri = await this.resolvePlayableUri(uri);

      const { sound } = await Audio.Sound.createAsync(
        { uri: playableUri },
        {
          shouldPlay: true,
          progressUpdateIntervalMillis: PROGRESS_UPDATE_INTERVAL_MS,
          rate: this.playbackRate,
          shouldCorrectPitch: true,
          positionMillis: positionMs != null ? Math.max(0, positionMs) : 0,
        },
        this.handlePlaybackStatusUpdate,
        false
      );

      this.soundRef = sound;
      this.currentUri = uri;
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        this.lastStatus = {
          positionMs: status.positionMillis ?? 0,
          durationMs: status.durationMillis ?? 0,
          isPlaying: status.isPlaying ?? false,
          rate: status.rate ?? this.playbackRate,
        };
        this.notifyListeners();
      }
    })();
    return this.playPromise;
  }

  /** Pause current playback. */
  async pause(): Promise<void> {
    const sound = this.soundRef;
    if (!sound) return;

    try {
      await sound.pauseAsync();
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        this.lastStatus.isPlaying = false;
        this.lastStatus.positionMs = status.positionMillis ?? 0;
        this.lastStatus.rate = status.rate ?? this.playbackRate;
        this.notifyListeners();
      }
    } catch {
      this.soundRef = null;
      this.currentUri = null;
      this.lastStatus = { positionMs: 0, durationMs: 0, isPlaying: false, rate: this.playbackRate };
      throw new Error('Failed to pause playback');
    }
  }

  /** Stop current playback and unload. */
  async stop(): Promise<void> {
    await this.stopAndUnloadCurrent();
  }

  async seekTo(positionMs: number): Promise<void> {
    const sound = this.soundRef;
    if (!sound) return;

    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;

    const maxDuration = status.durationMillis ?? this.lastStatus.durationMs ?? 0;
    const nextPosition = Math.max(0, Math.min(positionMs, maxDuration));
    await sound.setPositionAsync(nextPosition);
    const nextStatus = await sound.getStatusAsync();
    if (nextStatus.isLoaded) {
      this.lastStatus = {
        positionMs: nextStatus.positionMillis ?? nextPosition,
        durationMs: nextStatus.durationMillis ?? maxDuration,
        isPlaying: nextStatus.isPlaying ?? false,
        rate: nextStatus.rate ?? this.playbackRate,
      };
      this.notifyListeners();
    }
  }

  async setPlaybackRate(rate: number): Promise<void> {
    const normalizedRate = rate <= 0 ? 1 : rate;
    this.playbackRate = normalizedRate;

    if (!this.soundRef) {
      this.lastStatus.rate = normalizedRate;
      this.notifyListeners();
      return;
    }

    try {
      await this.soundRef.setRateAsync(normalizedRate, true);
      const status = await this.soundRef.getStatusAsync();
      if (status.isLoaded) {
        this.lastStatus = {
          positionMs: status.positionMillis ?? 0,
          durationMs: status.durationMillis ?? 0,
          isPlaying: status.isPlaying ?? false,
          rate: status.rate ?? normalizedRate,
        };
        this.notifyListeners();
      }
    } catch {
      this.lastStatus.rate = normalizedRate;
      this.notifyListeners();
      throw new Error('Failed to change playback rate');
    }
  }

  /** Get current playback status (position, duration, isPlaying). */
  getStatus(): VoicePlayerStatus {
    return { ...this.lastSnapshot.status };
  }

  getSnapshot(): VoicePlayerSnapshot {
    return this.lastSnapshot;
  }

  /** Check if any sound is currently loaded. */
  hasActiveSound(): boolean {
    return this.soundRef != null;
  }
}

export const VoicePlayerService = new VoicePlayerServiceClass();
