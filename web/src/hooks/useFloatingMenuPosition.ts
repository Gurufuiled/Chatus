import { useLayoutEffect, useState, type RefObject } from 'react';
import {
  boundsFromRect,
  clampFloatingPosition,
  getViewportBounds,
  intersectBounds,
  maxHeightInBounds,
  type FloatingBounds,
  type Point,
} from '@/utils/clampFloatingPosition';

interface UseFloatingMenuPositionOptions {
  open: boolean;
  anchor: Point | null;
  menuRef: RefObject<HTMLElement | null>;
  boundsRef?: RefObject<HTMLElement | null>;
  /** Re-run layout when menu content changes (e.g. delete sub-panel). */
  deps?: unknown[];
}

interface FloatingMenuPosition {
  left: number;
  top: number;
  maxHeight: number;
  ready: boolean;
}

export function useFloatingMenuPosition({
  open,
  anchor,
  menuRef,
  boundsRef,
  deps = [],
}: UseFloatingMenuPositionOptions): FloatingMenuPosition {
  const [state, setState] = useState<FloatingMenuPosition>(() => ({
    left: 0,
    top: 0,
    maxHeight: maxHeightInBounds(getViewportBounds()),
    ready: false,
  }));

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setState((prev) => ({ ...prev, ready: false }));
      return;
    }

    const menu = menuRef.current;
    if (!menu) return;

    let bounds: FloatingBounds = getViewportBounds();
    if (boundsRef?.current) {
      bounds = intersectBounds(bounds, boundsFromRect(boundsRef.current.getBoundingClientRect()));
    }

    const panelRect = menu.getBoundingClientRect();
    const width = panelRect.width || menu.offsetWidth;
    const height = panelRect.height || menu.offsetHeight;
    const { x, y } = clampFloatingPosition(anchor, width, height, bounds);

    setState({
      left: x,
      top: y,
      maxHeight: maxHeightInBounds(bounds),
      ready: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are caller-controlled content keys
  }, [open, anchor?.x, anchor?.y, menuRef, boundsRef, ...deps]);

  if (!open || !anchor) {
    return {
      left: anchor?.x ?? 0,
      top: anchor?.y ?? 0,
      maxHeight: maxHeightInBounds(getViewportBounds()),
      ready: false,
    };
  }

  return {
    left: state.ready ? state.left : anchor.x,
    top: state.ready ? state.top : anchor.y,
    maxHeight: state.maxHeight,
    ready: state.ready,
  };
}
