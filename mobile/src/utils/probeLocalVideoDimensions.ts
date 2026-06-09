import { createVideoPlayer } from 'expo-video';

export type LocalVideoDimensions = {
  width: number;
  height: number;
};

export function isSquareVideoDimensions(
  dims: LocalVideoDimensions,
  tolerancePx = 4,
): boolean {
  return Math.abs(dims.width - dims.height) <= tolerancePx;
}

const PROBE_RETRY_DELAY_MS = 400;

/** Probe with one delayed retry for transient expo-video readiness races. */
export async function probeLocalVideoDimensionsWithRetry(
  uri: string,
  attempts = 2,
): Promise<LocalVideoDimensions | null> {
  let result = await probeLocalVideoDimensions(uri);
  for (let i = 1; i < attempts && !result; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, PROBE_RETRY_DELAY_MS));
    result = await probeLocalVideoDimensions(uri);
  }
  return result;
}

/** Best-effort probe of a local video file's pixel dimensions (expo-video). */
export async function probeLocalVideoDimensions(
  uri: string,
  timeoutMs = 12_000,
): Promise<LocalVideoDimensions | null> {
  const normalized = uri.trim();
  if (!normalized) return null;

  const player = createVideoPlayer(normalized);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: LocalVideoDimensions | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        player.removeAllListeners('statusChange');
      } catch {
        // ignore
      }
      try {
        player.release();
      } catch {
        // ignore
      }
      resolve(value);
    };

    const readTrack = (): LocalVideoDimensions | null => {
      const track = player.videoTrack;
      const width = track?.size?.width;
      const height = track?.size?.height;
      if (typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0) {
        return { width, height };
      }
      return null;
    };

    const timeout = setTimeout(() => finish(null), timeoutMs);

    const immediate = readTrack();
    if (immediate) {
      finish(immediate);
      return;
    }

    player.addListener('statusChange', () => {
      const dims = readTrack();
      if (dims) {
        finish(dims);
        return;
      }
      if (player.status === 'error') {
        finish(null);
      }
    });
  });
}
