import { postToLoginusParent } from '@/embed/loginusBridge';

export function isEmbeddedInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function formatMicrophoneAccessError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotFoundError') {
    return 'Микрофон не найден';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    if (isEmbeddedInIframe()) {
      return 'Нет доступа к микрофону. Если запрос не появлялся — Loginus должен добавить allow="microphone" в iframe ChatUs';
    }
    return 'Доступ к микрофону запрещён — разрешите в настройках браузера';
  }
  return err instanceof Error ? err.message : 'Не удалось получить доступ к микрофону';
}

/** Screen-share / display-capture permission errors (iframe-aware). */
export function formatDisplayMediaAccessError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'AbortError') {
    if (isEmbeddedInIframe()) {
      return 'Нет доступа к демонстрации экрана. Если запрос не появлялся — Loginus должен добавить allow="display-capture" в iframe ChatUs';
    }
    if (name === 'AbortError') {
      return 'Демонстрация экрана отменена';
    }
    return 'Доступ к демонстрации экрана запрещён — разрешите в настройках браузера';
  }
  if (name === 'NotFoundError') {
    return 'Источник экрана не найден';
  }
  return err instanceof Error ? err.message : 'Не удалось начать демонстрацию экрана';
}

export function formatCameraAccessError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotFoundError') {
    return 'Камера не найдена';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    if (isEmbeddedInIframe()) {
      return 'Нет доступа к камере. Если запрос не появлялся — Loginus должен добавить allow="camera" в iframe ChatUs';
    }
    return 'Доступ к камере запрещён — разрешите в настройках браузера';
  }
  return err instanceof Error ? err.message : 'Не удалось получить доступ к камере';
}

export function notifyParentMicrophoneRequired(): void {
  if (!isEmbeddedInIframe()) return;
  postToLoginusParent({ type: 'loginus:featureRequired', feature: 'microphone' });
}
