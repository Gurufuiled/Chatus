import { useEffect, useRef } from 'react';
import './pin-confirm-dialog.css';

interface PinConfirmDialogProps {
  open: boolean;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (notify: boolean) => void;
}

export function PinConfirmDialog({
  open,
  pending = false,
  onClose,
  onConfirm,
}: PinConfirmDialogProps) {
  const firstBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="pin-confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-confirm-title"
    >
      <button
        type="button"
        className="pin-confirm-dialog__backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div className="pin-confirm-dialog__panel">
        <h2 id="pin-confirm-title" className="pin-confirm-dialog__title">
          Закрепить сообщение
        </h2>
        <p className="pin-confirm-dialog__text">
          Уведомить участников о закреплении?
        </p>
        <div className="pin-confirm-dialog__actions">
          <button
            ref={firstBtnRef}
            type="button"
            className="pin-confirm-dialog__btn pin-confirm-dialog__btn--primary"
            disabled={pending}
            onClick={() => onConfirm(true)}
          >
            Закрепить и уведомить
          </button>
          <button
            type="button"
            className="pin-confirm-dialog__btn"
            disabled={pending}
            onClick={() => onConfirm(false)}
          >
            Закрепить без уведомления
          </button>
          <button
            type="button"
            className="pin-confirm-dialog__btn pin-confirm-dialog__btn--ghost"
            disabled={pending}
            onClick={onClose}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
