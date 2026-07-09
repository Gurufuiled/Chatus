import { AudioSession } from '@livekit/react-native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';

/**
 * Release audio sessions that block expo-av voice recording after calls or camera capture.
 */
export async function releaseMediaAudioSession(): Promise<void> {
  try {
    await AudioSession.stopAudioSession();
  } catch {
    // LiveKit not active — ignore.
  }

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
