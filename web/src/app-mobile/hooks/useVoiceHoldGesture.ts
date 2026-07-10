import { useCallback, useEffect, useRef, useState } from 'react';

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
  /** Fired on a quick tap (no hold) while idle — used to toggle video-note entry mode. */
  onIdleTap?: () => void;
}

export function useVoiceHoldGesture({
  disabled,
  canSend,
  isRecording,
  isProcessing,
  onStartRecording,
  onCancelRecording,
  onFinishRecording,
  onIdleTap,
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
  const tapEligibleRef = useRef(true);
  const isRecordingRef = useRef(isRecording);
  const onCancelRecordingRef = useRef(onCancelRecording);
  const onFinishRecordingRef = useRef(onFinishRecording);
  const onIdleTapRef = useRef(onIdleTap);

  isRecordingRef.current = isRecording;
  onCancelRecordingRef.current = onCancelRecording;
  onFinishRecordingRef.current = onFinishRecording;
  onIdleTapRef.current = onIdleTap;

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
    if (modeRef.current === 'idle' && !isRecordingRef.current) return;
    clearHoldTimer();
    modeRef.current = 'locked';
    gestureActiveRef.current = false;
    cancelProgressRef.current = 0;
    setGesture({
      mode: 'locked',
      dragX: 0,
      dragY: 0,
      cancelProgress: 0,
      lockProgress: 1,
      touchTracking: false,
    });
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
      const shouldTap = tapEligibleRef.current;
      tapEligibleRef.current = true;
      resetVisuals('idle');
      if (shouldTap) {
        onIdleTapRef.current?.();
      }
      return;
    }

    // Locked: keep recording UI with send/cancel (mobile parity).
    if (modeRef.current === 'locked') {
      holdActivatedRef.current = false;
      setGesture((prev) => ({ ...prev, touchTracking: false }));
      return;
    }

    holdActivatedRef.current = false;
    tapEligibleRef.current = true;

    if (cancelProgressRef.current >= CANCEL_TRIGGER_PROGRESS) {
      if (isRecordingRef.current) {
        onCancelRecordingRef.current();
      } else {
        pendingCancelRef.current = true;
      }
      resetVisuals('idle');
      return;
    }

    // Release while holding → send (mobile parity).
    if (isRecordingRef.current) {
      onFinishRecordingRef.current(true);
      resetVisuals('idle');
      return;
    }

    // Mic permission / MediaRecorder still starting: wait, then send.
    pendingFinishRef.current = true;
    resetVisuals('idle');
  }, [clearHoldTimer, resetVisuals]);

  const onMicPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled || canSend || isProcessing || isRecording) return;
      if (e.button !== 0) return;

      e.preventDefault();
      gestureActiveRef.current = true;
      holdActivatedRef.current = false;
      tapEligibleRef.current = true;
      pointerIdRef.current = e.pointerId;
      startPointRef.current = { x: e.clientX, y: e.clientY };
      pendingFinishRef.current = false;
      pendingCancelRef.current = false;

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Some browsers reject capture on non-primary pointers.
      }

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
        tapEligibleRef.current = false;
        modeRef.current = 'holding';
        setGesture((prev) => ({ ...prev, mode: 'holding' }));
        void onStartRecording();
      }, HOLD_TO_RECORD_MS);
    },
    [canSend, clearHoldTimer, disabled, isProcessing, isRecording, onStartRecording],
  );

  const onMicPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement> | PointerEvent) => {
      if (!gestureActiveRef.current || pointerIdRef.current !== e.pointerId) return;
      const dx = e.clientX - startPointRef.current.x;
      const dy = e.clientY - startPointRef.current.y;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        tapEligibleRef.current = false;
      }
      if (!holdActivatedRef.current) return;
      updateDrag(dx, dy);
    },
    [updateDrag],
  );

  const onMicPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement> | PointerEvent) => {
      if (pointerIdRef.current !== e.pointerId) return;
      pointerIdRef.current = null;
      handleRelease();
    },
    [handleRelease],
  );

  const onMicPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLElement> | PointerEvent) => {
      if (pointerIdRef.current !== e.pointerId) return;
      pointerIdRef.current = null;
      clearHoldTimer();
      gestureActiveRef.current = false;

      if (cancelProgressRef.current >= CANCEL_TRIGGER_PROGRESS) {
        holdActivatedRef.current = false;
        if (isRecordingRef.current) {
          onCancelRecordingRef.current();
        } else {
          pendingCancelRef.current = true;
        }
        resetVisuals('idle');
        return;
      }

      // On web/iOS, pointercancel is common when the mic button unmounts into
      // the recording stage. Lock so the user can still send or delete.
      if (isRecordingRef.current || holdActivatedRef.current || modeRef.current === 'holding') {
        holdActivatedRef.current = false;
        lockRecording();
        return;
      }
      resetVisuals('idle');
    },
    [clearHoldTimer, lockRecording, resetVisuals],
  );

  useEffect(() => {
    if (!gesture.touchTracking || modeRef.current === 'locked') return;

    const onMove = (e: PointerEvent) => onMicPointerMove(e);
    const onUp = (e: PointerEvent) => onMicPointerUp(e);
    const onCancel = (e: PointerEvent) => onMicPointerCancel(e);

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [gesture.touchTracking, onMicPointerCancel, onMicPointerMove, onMicPointerUp]);

  const syncRecordingMode = useCallback(() => {
    if (isRecording && modeRef.current === 'idle') {
      // Recording started without an active hold (or after release race) → lock
      // so Cancel + Send are always available in PWA.
      if (pendingCancelRef.current) {
        pendingCancelRef.current = false;
        pendingFinishRef.current = false;
        onCancelRecordingRef.current();
        resetVisuals('idle');
        return;
      }
      if (pendingFinishRef.current) {
        pendingFinishRef.current = false;
        onFinishRecordingRef.current(true);
        resetVisuals('idle');
        return;
      }
      if (!gestureActiveRef.current) {
        lockRecording();
        return;
      }
      modeRef.current = 'holding';
      holdActivatedRef.current = true;
      setGesture((prev) => ({ ...prev, mode: 'holding', touchTracking: true }));
    }

    // Hold gesture lost while still recording → lock with send button.
    if (
      isRecording &&
      modeRef.current === 'holding' &&
      !gestureActiveRef.current &&
      !gesture.touchTracking
    ) {
      lockRecording();
      return;
    }

    if (!isRecording && !isProcessing && modeRef.current !== 'idle') {
      pendingFinishRef.current = false;
      pendingCancelRef.current = false;
      resetVisuals('idle');
    }
  }, [gesture.touchTracking, isProcessing, isRecording, lockRecording, resetVisuals]);

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
