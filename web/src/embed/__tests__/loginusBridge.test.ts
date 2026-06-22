import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  listenForLoginusInit,
  listenForLoginusProfileUpdated,
} from '@/embed/loginusBridge';

describe('loginusBridge profile listeners', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles loginus:profileUpdated from allowed parent origin', () => {
    const onProfileUpdated = vi.fn();
    const unsubscribe = listenForLoginusProfileUpdated(onProfileUpdated);

    const event = new MessageEvent('message', {
      data: {
        type: 'loginus:profileUpdated',
        initData: 'jwt-token',
        profile: { firstName: 'Anna' },
      },
      origin: 'https://id.startapus.com',
      source: window.parent,
    });

    vi.spyOn(window, 'parent', 'get').mockReturnValue(event.source as Window);
    window.dispatchEvent(event);

    expect(onProfileUpdated).toHaveBeenCalledWith('jwt-token', {
      firstName: 'Anna',
    });

    unsubscribe();
  });

  it('passes optional profile on loginus:init', () => {
    const onInit = vi.fn();
    const unsubscribe = listenForLoginusInit(onInit);

    const event = new MessageEvent('message', {
      data: {
        type: 'loginus:init',
        initData: 'jwt-token',
        profile: { lastName: 'Ivanov' },
      },
      origin: 'https://id.startapus.com',
      source: window.parent,
    });

    vi.spyOn(window, 'parent', 'get').mockReturnValue(event.source as Window);
    window.dispatchEvent(event);

    expect(onInit).toHaveBeenCalledWith('jwt-token', { lastName: 'Ivanov' });

    unsubscribe();
  });
});
