import { useEffect, useMemo } from 'react';
import { useMobileUiStore } from '@/stores/mobileUiStore';

export function useMobileAppearance() {
  const preference = useMobileUiStore((s) => s.appAppearancePreference);
  const hydrated = useMobileUiStore((s) => s.hydrated);
  const hydrate = useMobileUiStore((s) => s.hydrate);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  const resolvedScheme = useMemo<'light' | 'dark'>(() => {
    if (preference === 'dark') return 'dark';
    if (preference === 'light') return 'light';
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }, [preference]);

  useEffect(() => {
    const root = document.querySelector('.mobile-app');
    if (!root) return;
    root.setAttribute('data-scheme', resolvedScheme);

    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      root.setAttribute('data-scheme', mq.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference, resolvedScheme]);

  return { preference, resolvedScheme };
}
