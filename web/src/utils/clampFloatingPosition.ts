const DEFAULT_PADDING = 8;

export interface Point {
  x: number;
  y: number;
}

export interface FloatingBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function getViewportBounds(): FloatingBounds {
  return {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
}

export function boundsFromRect(rect: DOMRect): FloatingBounds {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  };
}

export function intersectBounds(a: FloatingBounds, b: FloatingBounds): FloatingBounds {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
}

/** Clamp a floating panel to bounds; flip left/up when overflowing. */
export function clampFloatingPosition(
  anchor: Point,
  panelWidth: number,
  panelHeight: number,
  bounds: FloatingBounds,
  padding = DEFAULT_PADDING,
): Point {
  const minX = bounds.left + padding;
  const minY = bounds.top + padding;
  const maxX = Math.max(minX, bounds.right - panelWidth - padding);
  const maxY = Math.max(minY, bounds.bottom - panelHeight - padding);

  let x = anchor.x;
  let y = anchor.y;

  if (x + panelWidth + padding > bounds.right) {
    x = anchor.x - panelWidth;
  }
  if (y + panelHeight + padding > bounds.bottom) {
    y = anchor.y - panelHeight;
  }

  return {
    x: Math.max(minX, Math.min(x, maxX)),
    y: Math.max(minY, Math.min(y, maxY)),
  };
}

export function maxHeightInBounds(bounds: FloatingBounds, padding = DEFAULT_PADDING): number {
  return Math.max(120, bounds.bottom - bounds.top - padding * 2);
}
