import { useCallback, useEffect, useRef, useState } from 'react';

const KEYBOARD_OPEN_THRESHOLD = 50;
const COMPOSER_PADDING_WHEN_KEYBOARD = 8;
const STABILITY_MS = 80;
const PRE_LIFT_GRACE_MS = 300;

/**
 * Lifts the chat composer above the iOS virtual keyboard using visualViewport.
 *
 * iOS often shrinks `window.innerHeight` when the keyboard opens, which makes the
 * naive `innerHeight - vv.height` formula collapse to ~0 and leaves the composer
 * behind the keyboard. We freeze a "keyboard-closed" baseline height and keep
 * using it while the keyboard is open.
 *
 * Also exposes `triggerPreLift` for onMouseDown on the textarea: Safari's
 * pre-focus visibility check runs after mousedown, so pre-lifting avoids the
 * intermittent "keyboard covers composer" path.
 */
export function useMobileComposerKeyboard() {
  const [keyboardLift, setKeyboardLift] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const baselineRef = useRef(0);
  const savedLiftRef = useRef(0);
  const openRef = useRef(false);
  const preLiftUntilRef = useRef(0);
  const keyboardLiftRef = useRef(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    baselineRef.current = Math.max(window.innerHeight, vv.height);
    let stabilityTimer: ReturnType<typeof setTimeout> | null = null;
    let orientationTimer: ReturnType<typeof setTimeout> | null = null;

    const commitClosed = () => {
      if (stabilityTimer) {
        clearTimeout(stabilityTimer);
        stabilityTimer = null;
      }
      baselineRef.current = Math.max(window.innerHeight, vv.height);
      openRef.current = false;
      preLiftUntilRef.current = 0;
      if (keyboardLiftRef.current !== 0) {
        keyboardLiftRef.current = 0;
        setKeyboardLift(0);
      }
      setKeyboardOpen(false);
    };

    const commitOpen = (lift: number) => {
      savedLiftRef.current = lift;
      openRef.current = true;
      keyboardLiftRef.current = lift;
      setKeyboardOpen(true);
      setKeyboardLift(lift);
    };

    const update = () => {
      // Keep growing the closed-keyboard baseline; never shrink it mid-session
      // while the keyboard is open (innerHeight may already be reduced).
      if (!openRef.current) {
        baselineRef.current = Math.max(baselineRef.current, window.innerHeight, vv.height);
      }

      const liftFromBaseline = Math.max(0, baselineRef.current - vv.height - vv.offsetTop);
      const liftFromInner = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // Prefer the larger reading — one of them is usually correct depending on
      // whether iOS resized the layout viewport.
      const lift = Math.max(liftFromBaseline, liftFromInner);

      if (lift < KEYBOARD_OPEN_THRESHOLD) {
        // During pre-lift grace, ignore transient low readings so Safari's early
        // resize frames don't yank the composer back under the keyboard.
        if (Date.now() < preLiftUntilRef.current) {
          return;
        }
        if (!openRef.current && keyboardLiftRef.current === 0) {
          baselineRef.current = Math.max(baselineRef.current, window.innerHeight, vv.height);
          return;
        }
        commitClosed();
        return;
      }

      preLiftUntilRef.current = 0;

      // Apply immediately so the composer isn't covered for 80ms, then refine
      // once iOS stops emitting transient mid-transition heights.
      if (!openRef.current || Math.abs(lift - savedLiftRef.current) > 24) {
        commitOpen(lift);
      }

      if (stabilityTimer) clearTimeout(stabilityTimer);
      stabilityTimer = setTimeout(() => {
        commitOpen(lift);
      }, STABILITY_MS);
    };

    const onVvScroll = () => {
      // iOS sometimes scrolls the visual viewport; snap the document back.
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
      update();
    };

    const onOrientationChange = () => {
      if (stabilityTimer) {
        clearTimeout(stabilityTimer);
        stabilityTimer = null;
      }
      if (orientationTimer) {
        clearTimeout(orientationTimer);
        orientationTimer = null;
      }
      savedLiftRef.current = 0;
      commitClosed();
      orientationTimer = setTimeout(() => {
        orientationTimer = null;
        baselineRef.current = Math.max(window.innerHeight, vv.height);
        update();
      }, 200);
    };

    const onFocusOut = () => {
      // If focus left the composer and vv already reports closed, drop pre-lift.
      window.setTimeout(() => {
        const active = document.activeElement;
        const tag = active?.tagName;
        if (tag === 'TEXTAREA' || tag === 'INPUT') return;
        const liftNow = Math.max(
          0,
          baselineRef.current - vv.height - vv.offsetTop,
          window.innerHeight - vv.height - vv.offsetTop,
        );
        if (liftNow < KEYBOARD_OPEN_THRESHOLD) {
          commitClosed();
        }
      }, 0);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', onVvScroll);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', onOrientationChange);
    document.addEventListener('focusout', onFocusOut);
    update();

    return () => {
      if (stabilityTimer) clearTimeout(stabilityTimer);
      if (orientationTimer) clearTimeout(orientationTimer);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', onVvScroll);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', onOrientationChange);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  // While keyboard is open, fight Safari scroll jumps (text ↔ emoji switch).
  useEffect(() => {
    if (!keyboardOpen) return;
    const snap = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    window.addEventListener('scroll', snap, { passive: true });
    return () => window.removeEventListener('scroll', snap);
  }, [keyboardOpen]);

  const triggerPreLift = useCallback(() => {
    if (savedLiftRef.current <= 0) return;
    // Don't mark openRef yet — only lift visually and protect against early
    // low vv readings for a short grace window.
    preLiftUntilRef.current = Date.now() + PRE_LIFT_GRACE_MS;
    keyboardLiftRef.current = savedLiftRef.current;
    setKeyboardOpen(true);
    setKeyboardLift(savedLiftRef.current);
  }, []);

  const composerPaddingBottom = keyboardOpen
    ? COMPOSER_PADDING_WHEN_KEYBOARD
    : undefined;

  return { keyboardLift, keyboardOpen, composerPaddingBottom, triggerPreLift };
}
