import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  formatMicrophoneAccessError,
  isEmbeddedInIframe,
  notifyParentMicrophoneRequired,
} from '@/utils/microphoneAccess';

vi.mock('@/embed/loginusBridge', () => ({
  postToLoginusParent: vi.fn(),
}));

import { postToLoginusParent } from '@/embed/loginusBridge';

function withMockedTop<T>(mockTop: Window | null, fn: () => T): T {
  const top = window.top;
  Object.defineProperty(window, 'top', { value: mockTop, configurable: true });
  try {
    return fn();
  } finally {
    Object.defineProperty(window, 'top', { value: top, configurable: true });
  }
}

describe('microphoneAccess', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('detects iframe embedding', () => {
    withMockedTop({} as Window, () => {
      expect(isEmbeddedInIframe()).toBe(true);
    });
  });

  it('maps NotFoundError to Russian message', () => {
    const err = new DOMException('no device', 'NotFoundError');
    expect(formatMicrophoneAccessError(err)).toBe('Микрофон не найден');
  });

  it('maps permission denial in iframe to Loginus hint', () => {
    withMockedTop({} as Window, () => {
      const err = new DOMException('denied', 'NotAllowedError');
      expect(formatMicrophoneAccessError(err)).toContain('allow="microphone"');
    });
  });

  it('maps permission denial outside iframe to browser settings hint', () => {
    const err = new DOMException('denied', 'PermissionDeniedError');
    expect(formatMicrophoneAccessError(err)).toBe(
      'Доступ к микрофону запрещён — разрешите в настройках браузера',
    );
  });

  it('notifies parent when embedded and microphone is required', () => {
    withMockedTop({} as Window, () => {
      notifyParentMicrophoneRequired();
      expect(postToLoginusParent).toHaveBeenCalledWith({
        type: 'loginus:featureRequired',
        feature: 'microphone',
      });
    });
  });
});
