export type VideoNotePlaybackSnapshot = {
  messageId: string | null;
  uri: string | null;
  authorLabel: string | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  progress: number;
};

type Listener = () => void;
type ActiveController = {
  togglePlayback: () => void;
  stopPlayback: () => void;
} | null;

let snapshot: VideoNotePlaybackSnapshot = {
  messageId: null,
  uri: null,
  authorLabel: null,
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  progress: 0,
};

let controller: ActiveController = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeToVideoNotePlayback(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getVideoNotePlaybackSnapshot(): VideoNotePlaybackSnapshot {
  return snapshot;
}

export function setVideoNotePlaybackSnapshot(next: VideoNotePlaybackSnapshot) {
  const prev = snapshot;
  if (
    prev.messageId === next.messageId &&
    prev.uri === next.uri &&
    prev.authorLabel === next.authorLabel &&
    prev.isPlaying === next.isPlaying &&
    prev.positionMs === next.positionMs &&
    prev.durationMs === next.durationMs &&
    Math.abs(prev.progress - next.progress) < 0.002
  ) {
    return;
  }
  snapshot = next;
  emit();
}

export function clearVideoNotePlaybackSnapshot(messageId?: string | null) {
  if (messageId != null && snapshot.messageId !== messageId) return;
  snapshot = {
    messageId: null,
    uri: null,
    authorLabel: null,
    isPlaying: false,
    positionMs: 0,
    durationMs: 0,
    progress: 0,
  };
  emit();
}

export function setActiveVideoNoteController(next: ActiveController) {
  controller = next;
}

export function clearActiveVideoNoteController(expected?: ActiveController) {
  if (expected != null && controller !== expected) return;
  controller = null;
}

export function stopActiveVideoNotePlayback() {
  controller?.stopPlayback();
}

export function toggleActiveVideoNotePlayback() {
  controller?.togglePlayback();
}
