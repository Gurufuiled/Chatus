import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';

/**
 * Normalize audio mode after calls/capture so expo-av playback/recording works again.
 * NOTE: Avoid direct LiveKit AudioSession stop calls here — they can crash on iOS
 * while transport is tearing down. We only reset Expo audio mode.
 */
export async function releaseMediaAudioSession(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    });
  } catch {
    // Ignore reset failures.
  }
}
