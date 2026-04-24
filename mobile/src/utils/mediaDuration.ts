function formatDurationFromSeconds(totalSeconds: number): string {
  const safeTotalSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeTotalSeconds / 60);
  const seconds = safeTotalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Round a duration in ms to a whole number of seconds for display.
 * Uses simple rounding (half-up) so a 1500ms clip shows as "0:02",
 * not "0:01" or "0:02" depending on which function is called.
 */
export function getRoundedMediaDurationSeconds(durationMs: number): number {
  if (durationMs <= 0) return 0;
  return Math.max(1, Math.round(durationMs / 1000));
}

export function formatMediaDuration(durationMs: number): string {
  return formatDurationFromSeconds(getRoundedMediaDurationSeconds(durationMs));
}

/**
 * Format playback elapsed time (shown inside expanded video-note).
 * Uses floor so the counter feels like it's counting up naturally.
 * Clamps to [0, totalDurationSeconds] so it never exceeds the total.
 */
export function formatPlaybackElapsedDuration(
  elapsedMs: number,
  totalDurationMs: number
): string {
  const totalSeconds = getRoundedMediaDurationSeconds(totalDurationMs);
  if (totalSeconds <= 0) return formatDurationFromSeconds(0);
  const elapsedSeconds = Math.min(totalSeconds, Math.max(0, Math.floor(elapsedMs / 1000)));
  return formatDurationFromSeconds(elapsedSeconds);
}

/**
 * Format remaining playback time (shown on voice bubble during playback).
 * Uses ceil so the countdown feels natural – it reaches 0:00 exactly when
 * the audio finishes, never showing a negative or jumping past a second.
 */
export function formatRemainingPlaybackDuration(remainingMs: number): string {
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return formatDurationFromSeconds(remainingSeconds);
}
