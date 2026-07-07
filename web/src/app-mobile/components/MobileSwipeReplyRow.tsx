import { useCallback, useRef, type ReactNode } from 'react';

const SWIPE_TRIGGER_PX = 34;
const SWIPE_MAX_PX = 72;
const SWIPE_ACTIVATE_PX = 12;

interface MobileSwipeReplyRowProps {
  enabled: boolean;
  onReply: () => void;
  children: ReactNode;
}

export function MobileSwipeReplyRow({ enabled, onReply, children }: MobileSwipeReplyRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);
  const swipingRef = useRef(false);

  const resetSwipe = useCallback(() => {
    const content = contentRef.current;
    const icon = iconRef.current;
    if (content) {
      content.style.transition = 'transform 140ms ease';
      content.style.transform = '';
    }
    if (icon) {
      icon.style.transition = 'opacity 140ms ease, transform 140ms ease';
      icon.style.opacity = '0';
      icon.style.transform = 'scale(0.84)';
    }
    pointerIdRef.current = null;
    startRef.current = null;
    triggeredRef.current = false;
    swipingRef.current = false;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || e.button !== 0) return;
      pointerIdRef.current = e.pointerId;
      startRef.current = { x: e.clientX, y: e.clientY };
      triggeredRef.current = false;
      swipingRef.current = false;
    },
    [enabled],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || pointerIdRef.current !== e.pointerId || !startRef.current) return;

      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;

      if (!swipingRef.current) {
        if (Math.abs(dy) > SWIPE_ACTIVATE_PX && Math.abs(dy) > Math.abs(dx)) {
          resetSwipe();
          return;
        }
        if (dx > 0 || Math.abs(dx) < SWIPE_ACTIVATE_PX) return;
        swipingRef.current = true;
        rowRef.current?.setPointerCapture(e.pointerId);
      }

      const offset = Math.max(-SWIPE_MAX_PX, Math.min(0, dx));
      const content = contentRef.current;
      const icon = iconRef.current;
      if (content) {
        content.style.transition = 'none';
        content.style.transform = `translateX(${offset}px)`;
      }
      if (icon) {
        const progress = Math.min(1, Math.abs(offset) / SWIPE_TRIGGER_PX);
        icon.style.transition = 'none';
        icon.style.opacity = String(0.45 + progress * 0.55);
        icon.style.transform = `scale(${0.84 + progress * 0.16})`;
      }

      if (!triggeredRef.current && offset <= -SWIPE_TRIGGER_PX) {
        triggeredRef.current = true;
        onReply();
      }
    },
    [enabled, onReply, resetSwipe],
  );

  const handlePointerEnd = useCallback(
    (e: React.PointerEvent) => {
      if (pointerIdRef.current !== e.pointerId) return;
      if (rowRef.current?.hasPointerCapture(e.pointerId)) {
        rowRef.current.releasePointerCapture(e.pointerId);
      }
      resetSwipe();
    },
    [resetSwipe],
  );

  if (!enabled) {
    return <div className="mobile-swipe-reply">{children}</div>;
  }

  return (
    <div
      ref={rowRef}
      className="mobile-swipe-reply mobile-swipe-reply--enabled"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <div ref={iconRef} className="mobile-swipe-reply__icon" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path
            d="M9 14L4 9l5-5M4 9h11a5 5 0 015 5v2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div ref={contentRef} className="mobile-swipe-reply__content">
        {children}
      </div>
    </div>
  );
}
