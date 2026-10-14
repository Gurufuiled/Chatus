/**
 * VoiceRecorderService - Records voice messages using expo-av.
 * Outputs AAC .m4a format with waveform metering for UI.
 */

import { Audio } from 'expo-av';
import { Platform } from 'react-native';

import { releaseMediaAudioSession } from '../utils/releaseMediaAudioSession';
import { VoicePlayerService } from './VoicePlayerService';
import { buildLiveWaveform, buildUiWaveform, dbToAmplitudeSample, dbToNormalized } from './waveformUtils';

const RAW_WAVEFORM_LIMIT = 600;
const UI_WAVEFORM_SAMPLE_COUNT = 72;
const LIVE_WAVEFORM_SAMPLE_COUNT = 28;
/** expo-av metering cadence; slightly tighter than 60ms so the live waveform reacts sooner at record start. */
const PROGRESS_INTERVAL_MS = 50;

type LiveWaveformListener = (waveform: number[]) => void;
type DurationListener = (durationMs: number) => void;

export interface VoiceRecordingResult {
  uri: string;
  durationMs: number;
  waveform: number[];
}

export { dbToNormalized } from './waveformUtils';

class VoiceRecorderServiceClass {
  private recording: InstanceType<typeof Audio.Recording> | null = null;
  private waveformSamples: number[] = [];
  private liveWaveform: number[] = [];
  private startTimeMs: number = 0;
  private liveWaveformListeners = new Set<LiveWaveformListener>();
  private durationListeners = new Set<DurationListener>();
  /** Длительность записи по данным самого рекордера (то, что окажется в файле). */
  private recordedDurationMs = 0;

  private emitLiveWaveform(nextWaveform: number[]): void {
    this.liveWaveform = nextWaveform;
    this.liveWaveformListeners.forEach((listener) => {
      try {
        listener(nextWaveform);
      } catch {
        // Ignore listener failures to keep recording stable.
      }
    });
  }

  subscribeToLiveWaveform(listener: LiveWaveformListener): () => void {
    this.liveWaveformListeners.add(listener);
    listener(this.liveWaveform);
    return () => {
      this.liveWaveformListeners.delete(listener);
    };
  }

  /**
   * Таймер записи в интерфейсе. Его источник — `durationMillis` самого рекордера, а не часы JS: тогда то, что
   * видно на таймере, равно длительности файла. Раньше таймер стартовал по часам после `await startRecording()`
   * (а звук начинал писаться раньше), и в сообщение «приплюсовывались» секунда-полторы, которые таймер простоял.
   */
  subscribeToDuration(listener: DurationListener): () => void {
    this.durationListeners.add(listener);
    listener(this.recordedDurationMs);
    return () => {
      this.durationListeners.delete(listener);
    };
  }

  private emitDuration(durationMs: number): void {
    this.recordedDurationMs = durationMs;
    this.durationListeners.forEach((listener) => {
      try {
        listener(durationMs);
      } catch {
        // Ignore listener failures to keep recording stable.
      }
    });
  }

  /** Request RECORD_AUDIO (Android) / microphone (iOS) permission. Returns true if granted. */
  async requestPermissions(): Promise<boolean> {
    // Уже выданное разрешение проверяется быстро; системный запрос — только когда его правда нет.
    try {
      const current = await Audio.getPermissionsAsync();
      if (current.status === 'granted') return true;
    } catch {
      // упадём на обычный запрос ниже
    }
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  }

  /** Ensure audio mode allows recording (required on iOS). */
  private async ensureAudioMode(): Promise<void> {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  }

  /** Restore regular playback mode after recording so voice playback can work on all devices. */
  private async restorePlaybackAudioMode(): Promise<void> {
    await releaseMediaAudioSession();
  }

  /** Start recording. Call stopRecording() to finish and get result. */
  async startRecording(): Promise<void> {
    if (this.recording) {
      throw new Error('Recording already in progress. Call stopRecording() first.');
    }

    // Каждый лишний шаг до старта — это секунда, в которую пользователь уже говорит, а таймер стоит.
    if (VoicePlayerService.hasActiveSound()) {
      await VoicePlayerService.stop().catch(() => {});
    }
    VoicePlayerService.invalidateAudioMode();

    const granted = await this.requestPermissions();
    if (!granted) {
      throw new Error(
        Platform.OS === 'android'
          ? 'RECORD_AUDIO permission denied'
          : 'Microphone permission denied'
      );
    }

    // `ensureAudioMode` сам выставляет все нужные режимы: отдельный `releaseMediaAudioSession` перед ним не нужен
    await this.ensureAudioMode();
    this.waveformSamples = [];
    this.emitDuration(0);
    this.emitLiveWaveform(Array(LIVE_WAVEFORM_SAMPLE_COUNT).fill(0.06));

    const options = {
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      isMeteringEnabled: true,
    };

    const onStatusUpdate = (status: { metering?: number; durationMillis?: number }): void => {
      if (typeof status.durationMillis === 'number' && status.durationMillis >= 0) {
        this.emitDuration(status.durationMillis);
      }
      if (status.metering != null && this.waveformSamples.length < RAW_WAVEFORM_LIMIT) {
        // линейная амплитуда: паузы остаются низкими (см. `dbToAmplitudeSample`)
        this.waveformSamples.push(dbToAmplitudeSample(status.metering));
        this.emitLiveWaveform(
          buildLiveWaveform(this.waveformSamples, LIVE_WAVEFORM_SAMPLE_COUNT)
        );
      }
    };

    try {
      const { recording } = await Audio.Recording.createAsync(
        options,
        onStatusUpdate,
        PROGRESS_INTERVAL_MS
      );

      this.recording = recording;
      /** Wall-clock from here matches real audio (createAsync can take hundreds of ms). */
      this.startTimeMs = Date.now();
    } catch (err) {
      this.emitLiveWaveform([]);
      this.emitDuration(0);
      this.startTimeMs = 0;
      await this.restorePlaybackAudioMode().catch(() => {});
      throw err;
    }
  }

  /** Stop recording and return { uri, durationMs, waveform }. */
  async stopRecording(): Promise<VoiceRecordingResult> {
    const rec = this.recording;
    if (!rec) {
      throw new Error('No active recording. Call startRecording() first.');
    }

    this.recording = null;
    const stopRequestedAtMs = Date.now();
    try {
      const status = await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      const measuredDurationMs = Math.max(stopRequestedAtMs - this.startTimeMs, 0);
      const fileDurationMs = status.durationMillis ?? 0;
      /** Prefer encoder duration; wall-clock can still drift vs file on some devices. */
      const resolvedDurationMs =
        fileDurationMs > 0 ? fileDurationMs : measuredDurationMs;

      if (!uri) {
        throw new Error('Recording produced no file URI');
      }

      return {
        uri,
        durationMs: resolvedDurationMs,
        waveform: buildUiWaveform(this.waveformSamples, UI_WAVEFORM_SAMPLE_COUNT),
      };
    } finally {
      this.waveformSamples = [];
      this.emitLiveWaveform([]);
      this.emitDuration(0);
      this.startTimeMs = 0;
      await this.restorePlaybackAudioMode().catch(() => {});
    }
  }

  /** Check if currently recording. */
  isRecording(): boolean {
    return this.recording != null;
  }
}

export const VoiceRecorderService = new VoiceRecorderServiceClass();
