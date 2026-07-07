import { useEffect, useState } from 'react';

const KEYBOARD_OPEN_THRESHOLD = 50;
const COMPOSER_PADDING_WHEN_KEYBOARD = 8;

/**
 * Lifts the chat composer above the iOS virtual keyboard using visualViewport.
 * Also signals when safe-area bottom padding should be reduced (keyboard flush).
 */
export function useMobileComposerKeyboard() {
  const [keyboardLift, setKeyboardLift] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const layoutHeight = window.innerHeight;
      const lift = Math.max(0, layoutHeight - vv.height - vv.offsetTop);
      const open = lift > KEYBOARD_OPEN_THRESHOLD;
      setKeyboardOpen(open);
      setKeyboardLift(open ? lift : 0);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const composerPaddingBottom = keyboardOpen
    ? COMPOSER_PADDING_WHEN_KEYBOARD
    : undefined;

  return { keyboardLift, keyboardOpen, composerPaddingBottom };
}
