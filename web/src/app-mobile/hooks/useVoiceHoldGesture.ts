import { useCallback, useRef, useState } from 'react';

const HOLD_TO_RECORD_MS = 170;
const LOCK_THRESHOLD = 88;
const CANCEL_THRESHOLD = 56;
const CANCEL_TRIGGER_PROGRESS = 0.84;
const MAX_UP_DRAG = 108;
const MAX_LEFT_DRAG = 92;

export type VoiceRecordMode = 'idle' | 'holding' | 'locked';

export interface VoiceGestureState {
  mode: VoiceRecordMode;
  dragX: number;
  dragY: number;
  cancelProgress: number;
  lockProgress: number;
  touchTracking: boolean;
}

interface UseVoiceHoldGestureOptions {
  disabled: boolean;
  canSend: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  onStartRecording: () => void | Promise<void>;
  onCancelRecording: () => void;
  onFinishRecording: (shouldSend: boolean) => void;
}

export function useVoiceHoldGesture({
  disabled,
  canSend,
  isRecording,
  isProcessing,
  onStartRecording,
  onCancelRecording,
  onFinishRecording,
}: UseVoiceHoldGestureOptions) {
  const [gesture, setGesture] = useState<VoiceGestureState>({
    mode: 'idle',
    dragX: 0,
    dragY: 0,
    cancelProgress: 0,
    lockProgress: 0,
    touchTracking: false,
  });

  const modeRef = useRef<VoiceRecordMode>('idle');
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActivatedRef = useRef(false);
  const gestureActiveRef = useRef(false);
  const cancelProgressRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const startPointRef = useRef({ x: 0, y: 0 });
  const pendingFinishRef = useRef(false);
  const pendingCancelRef = useRef(false);

  const resetVisuals = useCallback((mode: VoiceRecordMode = 'idle') => {
    modeRef.current = mode;
    cancelProgressRef.current = 0;
    setGesture({
      mode,
      dragX: 0,
      dragY: 0,
      cancelProgress: 0,
      lockProgress: 0,
      touchTracking: false,
    });
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const lockRecording = useCallback(() => {
    if (modeRef.current === 'idle') return;
    clearHoldTimer();
    modeRef.current = 'locked';
    setGesture((prev) => ({
      ...prev,
      mode: 'locked',
      dragX: 0,
      dragY: 0,
      cancelProgress: 0,
      lockProgress: 1,
      touchTracking: false,
    }));
  }, [clearHoldTimer]);

  const updateDrag = useCallback(
    (dx: number, dy: number) => {
      if (modeRef.current !== 'holding') return;

      const dragX = Math.max(-MAX_LEFT_DRAG, Math.min(0, dx));
      const dragY = Math.max(-MAX_UP_DRAG, Math.min(0, dy));
      const cancelProgress = Math.max(0, Math.min(1, -dragX / CANCEL_THRESHOLD));
      const lockProgress = Math.max(0, Math.min(1, -dragY / LOCK_THRESHOLD));

      cancelProgressRef.current = cancelProgress;
      setGesture((prev) => ({
        ...prev,
        dragX,
        dragY,
        cancelProgress,
        lockProgress,
      }));

      if (lockProgress >= 1) {
        lockRecording();
      }
    },
    [lockRecording],
  );

  const handleRelease = useCallback(() => {
    clearHoldTimer();
    gestureActiveRef.current = false;

    if (!holdActivatedRef.current && modeRef.current === 'idle') {
      resetVisuals('idle');
      return;
    }

    if (modeRef.current === 'locked') {
      holdActivatedRef.current = false;
      setGesture((prev) => ({ ...prev, touchTracking: false }));
      return;
    }

    holdActivatedRef.current = false;

    if (cancelProgressRef.current >= CANCEL_TRIGGER_PROGRESS) {
      if (isRecording) {
        onCancelRecording();
      } else {
        pendingCancelRef.current = true;
      }
      resetVisuals('idle');
      return;
    }

    if (isRecording) {
      onFinishRecording(true);
    } else {
      pendingFinishRef.current = true;
    }
    resetVisuals('idle');
  }, [clearHoldTimer, isRecording, onCancelRecording, onFinishRecording, resetVisuals]);

  const onMicPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || canSend || isProcessing || isRecording) return;
      if (e.button !== 0) return;

      e.preventDefault();
      gestureActiveRef.current = true;
      holdActivatedRef.current = false;
      pointerIdRef.current = e.pointerId;
      startPointRef.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);

      setGesture({
        mode: 'idle',
        dragX: 0,
        dragY: 0,
        cancelProgress: 0,
        lockProgress: 0,
        touchTracking: true,
      });

      clearHoldTimer();
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        if (!gestureActiveRef.current || modeRef.current !== 'idle') return;
        holdActivatedRef.current = true;
        modeRef.current = 'holding';
        setGesture((prev) => ({ ...prev, mode: 'holding' }));
        void onStartRecording();
      }, HOLD_TO_RECORD_MS);
    },
    [canSend, clearHoldTimer, disabled, isProcessing, isRecording, onStartRecording],
  );

  const onMicPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!gestureActiveRef.current || pointerIdRef.current !== e.pointerId) return;
      if (!holdActivatedRef.current) return;
      updateDrag(e.clientX - startPointRef.current.x, e.clientY - startPointRef.current.y);
    },
    [updateDrag],
  );

  const onMicPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      pointerIdRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      handleRelease();
    },
    [handleRelease],
  );

  const onMicPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      pointerIdRef.current = null;
      clearHoldTimer();
      gestureActiveRef.current = false;
      if (isRecording && modeRef.current !== 'locked') {
        onCancelRecording();
      }
      resetVisuals('idle');
    },
    [clearHoldTimer, isRecording, onCancelRecording, resetVisuals],
  );

  const syncRecordingMode = useCallback(() => {
    if (isRecording && modeRef.current === 'idle') {
      modeRef.current = 'holding';
      holdActivatedRef.current = true;
      setGesture((prev) => ({ ...prev, mode: 'holding', touchTracking: true }));
      if (pendingCancelRef.current) {
        pendingCancelRef.current = false;
        pendingFinishRef.current = false;
        onCancelRecording();
        resetVisuals('idle');
        return;
      }
      if (pendingFinishRef.current) {
        pendingFinishRef.current = false;
        onFinishRecording(true);
        resetVisuals('idle');
      }
    }
    if (!isRecording && !isProcessing && modeRef.current !== 'idle') {
      pendingFinishRef.current = false;
      pendingCancelRef.current = false;
      resetVisuals('idle');
    }
  }, [isProcessing, isRecording, onCancelRecording, onFinishRecording, resetVisuals]);

  return {
    gesture,
    onMicPointerDown,
    onMicPointerMove,
    onMicPointerUp,
    onMicPointerCancel,
    syncRecordingMode,
    lockRecording,
    resetVisuals,
  };
}
