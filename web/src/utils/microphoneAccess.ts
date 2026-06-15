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
      return 'Нет доступа к микрофону: Loginus должен добавить allow="microphone" в iframe ChatUs';
    }
    return 'Доступ к микрофону запрещён — разрешите в настройках браузера';
  }
  return err instanceof Error ? err.message : 'Не удалось получить доступ к микрофону';
}

export function notifyParentMicrophoneRequired(): void {
  if (!isEmbeddedInIframe()) return;
  postToLoginusParent({ type: 'loginus:featureRequired', feature: 'microphone' });
}
