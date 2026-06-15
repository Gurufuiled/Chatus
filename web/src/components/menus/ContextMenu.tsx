import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingMenuPosition } from '@/hooks/useFloatingMenuPosition';
import type { ReactNode } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  dangerStrong?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ open, x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const anchor = open ? { x, y } : null;

  const { left, top, maxHeight, ready } = useFloatingMenuPosition({
    open,
    anchor,
    menuRef: ref,
    deps: [items.length, items.map((item) => item.id).join(',')],
  });

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const menu = (
    <div
      ref={ref}
      className={`context-menu${ready ? '' : ' context-menu--measuring'}`}
      style={{ left, top, maxHeight }}
      role="menu"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={`context-menu__item${item.danger ? ' context-menu__item--danger' : ''}${item.dangerStrong ? ' context-menu__item--danger-strong' : ''}`}
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            item.onSelect();
            onClose();
          }}
        >
          {item.icon ? <span className="context-menu__icon">{item.icon}</span> : null}
          <span className="context-menu__label">{item.label}</span>
        </button>
      ))}
    </div>
  );

  return createPortal(menu, document.body);
}
