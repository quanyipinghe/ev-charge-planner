import { useEffect, useMemo, useState } from 'react';
import { cssVar } from './format';
import type { SegmentLevel } from '@evcp/models';

/**
 * The current instant, refreshed on an interval.
 *
 * Calling `Date.now()` during render makes a component non-idempotent — two renders
 * with the same props produce different output. Reading the clock from state keeps
 * render pure and, as a bonus, lets "now"-relative figures stay live.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}

export interface ChartPalette {
  ink: string;
  muted: string;
  line: string;
  surface: string;
  accent: string;
  peak: string;
  neutral: string;
  level: Record<SegmentLevel, string>;
}

/**
 * Resolves the design tokens ECharts needs.
 *
 * ECharts cannot follow `var(--…)`, so the values have to be read from the computed
 * style at option-build time. Keying the lookup on `isDark` is what makes a theme
 * switch actually repaint the charts.
 */
export function useChartPalette(isDark: boolean): ChartPalette {
  return useMemo(
    () => ({
      ink: cssVar('--text', isDark ? '#e9edf5' : '#0d1117'),
      muted: cssVar('--text-muted', isDark ? '#97a3b6' : '#5b6672'),
      line: cssVar('--border', isDark ? '#232c3d' : '#e2e6eb'),
      surface: cssVar('--surface', isDark ? '#131926' : '#ffffff'),
      accent: cssVar('--accent', isDark ? '#2dd4bf' : '#0f766e'),
      peak: cssVar('--peak', isDark ? '#fbbf24' : '#ea580c'),
      neutral: cssVar('--unknown', isDark ? '#64748b' : '#94a3b8'),
      level: {
        valley: cssVar('--valley', '#16a34a'),
        flat: cssVar('--flat', '#0284c7'),
        peak: cssVar('--peak', '#ea580c'),
        sharp: cssVar('--sharp', '#dc2626'),
        unknown: cssVar('--unknown', '#94a3b8'),
      },
    }),
    [isDark],
  );
}
