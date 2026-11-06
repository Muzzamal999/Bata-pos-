'use client';

import { useEffect } from 'react';
import { useThemeStore } from './theme-store';

/** Syncs the Zustand store with whatever the no-flash inline script already applied to the DOM. */
export function ThemeSync() {
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'dark' || current === 'light') {
      useThemeStore.setState({ theme: current });
    }
  }, []);
  return null;
}
