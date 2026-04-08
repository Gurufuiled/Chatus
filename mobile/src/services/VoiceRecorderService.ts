/**
 * VoiceRecorderService - Records voice messages using expo-av.
 * Outputs AAC .m4a format with waveform metering for UI.
 */

import { Audio } from 'expo-av';
import { Platform } from 'react-native';

import { VoicePlayerService } from './VoicePlayerService';
import { buildLiveWaveform, buildUiWaveform, dbToNormalized } from './waveformUtils';

const RAW_WAVEFORM_LIMIT = 600;
const UI_WAVEFORM_SAMPLE_COUNT = 72;
const LIVE_WAVEFORM_SAMPLE_COUNT = 28;
const PROGRESS_INTERVAL_MS = 60;

type LiveWaveformListener = (waveform: number[]) => void;

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

  /** Request RECORD_AUDIO (Android) / microphone (iOS) permission. Returns true if granted. */
  async requestPermissions(): Promise<boolean> {
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
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  }

  /** Start recording. Call stopRecording() to finish and get result. */
  async startRecording(): Promise<void> {
    if (this.recording) {
      throw new Error('Recording already in progress. Call stopRecording() first.');
    }

    const granted = await this.requestPermissions();
    if (!granted) {
      throw new Error(
        Platform.OS === 'android'
          ? 'RECORD_AUDIO permission denied'
          : 'Microphone permission denied'
      );
    }

    await VoicePlayerService.stop().catch(() => {});
    await this.ensureAudioMode();
    this.waveformSamples = [];
    this.emitLiveWaveform(Array(LIVE_WAVEFORM_SAMPLE_COUNT).fill(0.08));
    this.startTimeMs = Date.now();

    const options = {
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      isMeteringEnabled: true,
    };

    const onStatusUpdate = (status: { metering?: number }): void => {
      if (status.metering != null && this.waveformSamples.length < RAW_WAVEFORM_LIMIT) {
        this.waveformSamples.push(dbToNormalized(status.metering));
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
    } catch (err) {
      this.emitLiveWaveform([]);
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
      const resolvedDurationMs = Math.max(status.durationMillis ?? 0, measuredDurationMs);

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
