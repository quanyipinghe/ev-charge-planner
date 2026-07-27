import { useEffect, useState } from 'react';
import type { Theme } from '@evcp/models';
import { useSettings } from '@/store/settings';

const STORAGE_KEY = 'evcp-theme';

function resolve(theme: Theme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Applies the theme to `<html>` and reports whether dark mode is active.
 *
 * The chosen mode is mirrored into localStorage because `index.html` reads it
 * synchronously before first paint — IndexedDB is too late to avoid a white flash.
 */
export function useTheme(): { isDark: boolean } {
  const theme = useSettings((state) => state.settings.theme);
  const [isDark, setIsDark] = useState(() =>
    typeof window === 'undefined' ? true : resolve(theme),
  );

  useEffect(() => {
    const apply = () => {
      const dark = resolve(theme);
      setIsDark(dark);
      document.documentElement.classList.toggle('dark', dark);
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        /* private browsing — the media query still applies */
      }
    };

    apply();
    if (theme !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return { isDark };
}
