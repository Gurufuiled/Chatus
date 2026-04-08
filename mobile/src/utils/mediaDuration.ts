const MEDIA_DURATION_ROUND_UP_THRESHOLD_MS = 250;

function formatDurationFromSeconds(totalSeconds: number): string {
  const safeTotalSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeTotalSeconds / 60);
  const seconds = safeTotalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function getRoundedMediaDurationSeconds(durationMs: number): number {
  if (durationMs <= 0) return 0;
  return Math.max(
    1,
    Math.floor((durationMs + MEDIA_DURATION_ROUND_UP_THRESHOLD_MS) / 1000)
  );
}

export function formatMediaDuration(durationMs: number): string {
  return formatDurationFromSeconds(getRoundedMediaDurationSeconds(durationMs));
}

export function formatPlaybackElapsedDuration(
  elapsedMs: number,
  totalDurationMs: number
): string {
  const totalSeconds = getRoundedMediaDurationSeconds(totalDurationMs);
  if (totalSeconds <= 0) {
    return formatDurationFromSeconds(0);
  }

  const elapsedSeconds =
    elapsedMs <= 0
      ? 0
      : Math.floor((elapsedMs + MEDIA_DURATION_ROUND_UP_THRESHOLD_MS) / 1000);
  return formatDurationFromSeconds(Math.min(totalSeconds, Math.max(0, elapsedSeconds)));
}

export function formatRemainingPlaybackDuration(remainingMs: number): string {
  const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  return formatDurationFromSeconds(remainingSeconds);
}
