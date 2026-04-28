import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { uiStore } from '../stores/uiStore';
import {
  getPaletteForScheme,
  type AppAppearancePreference,
  type ResolvedColorScheme,
  type ThemeColors,
} from '../theme/palettes';

export type AppTheme = {
  preference: AppAppearancePreference;
  resolvedScheme: ResolvedColorScheme;
  colors: ThemeColors;
  setAppAppearancePreference: (p: AppAppearancePreference) => void;
};

const ThemeContext = createContext<AppTheme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const preference = uiStore((s) => s.appAppearancePreference);

  const resolvedScheme: ResolvedColorScheme = useMemo(() => {
    if (preference === 'system') {
      return systemScheme === 'dark' ? 'dark' : 'light';
    }
    return preference;
  }, [preference, systemScheme]);

  const colors = useMemo(
    () => getPaletteForScheme(resolvedScheme),
    [resolvedScheme]
  );

  const value = useMemo<AppTheme>(
    () => ({
      preference,
      resolvedScheme,
      colors,
      setAppAppearancePreference: uiStore.getState().setAppAppearancePreference,
    }),
    [preference, resolvedScheme, colors]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

/** For call sites that may run outside ThemeProvider (e.g. tests); returns light palette. */
export function useOptionalTheme(): AppTheme | null {
  return useContext(ThemeContext);
}
