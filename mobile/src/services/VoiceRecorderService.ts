/**
 * VoiceRecorderService - Records voice messages using expo-av.
 * Outputs AAC .m4a format with waveform metering for UI.
 */

import { Audio } from 'expo-av';
import { Platform } from 'react-native';

import { VoicePlayerService } from './VoicePlayerService';
import { buildUiWaveform, dbToNormalized } from './waveformUtils';

const RAW_WAVEFORM_LIMIT = 600;
const UI_WAVEFORM_SAMPLE_COUNT = 72;
const PROGRESS_INTERVAL_MS = 60;

export interface VoiceRecordingResult {
  uri: string;
  durationMs: number;
  waveform: number[];
}

export { dbToNormalized } from './waveformUtils';

class VoiceRecorderServiceClass {
  private recording: InstanceType<typeof Audio.Recording> | null = null;
  private waveformSamples: number[] = [];

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

    const options = {
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      isMeteringEnabled: true,
    };

    const onStatusUpdate = (status: { metering?: number }): void => {
      if (status.metering != null && this.waveformSamples.length < RAW_WAVEFORM_LIMIT) {
        this.waveformSamples.push(dbToNormalized(status.metering));
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
    try {
      const status = await rec.stopAndUnloadAsync();
      const uri = rec.getURI();

      if (!uri) {
        throw new Error('Recording produced no file URI');
      }

      return {
        uri,
        durationMs: status.durationMillis ?? 0,
        waveform: buildUiWaveform(this.waveformSamples, UI_WAVEFORM_SAMPLE_COUNT),
      };
    } finally {
      await this.restorePlaybackAudioMode().catch(() => {});
    }
  }

  /** Check if currently recording. */
  isRecording(): boolean {
    return this.recording != null;
  }
}

export const VoiceRecorderService = new VoiceRecorderServiceClass();
