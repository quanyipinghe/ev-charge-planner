import type { Locale, SegmentLevel } from '@evcp/models';
import { formatClock, formatDuration, formatMoney } from '@evcp/notification';

export { formatClock, formatDuration, formatMoney };

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatDate(instant: number, timeZone: string, locale: Locale): string {
  const key = `${timeZone}|${locale}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone,
      month: 'short',
      day: 'numeric',
    });
    dateFormatters.set(key, formatter);
  }
  return formatter.format(new Date(instant));
}

export function formatDateTime(instant: number, timeZone: string, locale: Locale): string {
  return `${formatDate(instant, timeZone, locale)} ${formatClock(instant, timeZone)}`;
}

export const formatNumber = (value: number, digits = 1): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const formatPercent = (fraction: number, digits = 0): string =>
  `${(fraction * 100).toFixed(digits)}%`;

/** CSS colour variable for a tariff level, shared by charts, chips and legends. */
export const LEVEL_COLOR: Record<SegmentLevel, string> = {
  valley: 'var(--valley)',
  flat: 'var(--flat)',
  peak: 'var(--peak)',
  sharp: 'var(--sharp)',
  unknown: 'var(--unknown)',
};

/** Resolves a CSS variable to a concrete colour — ECharts cannot read `var()`. */
export function cssVar(name: string, fallback = '#888'): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function levelColorValue(level: SegmentLevel): string {
  return cssVar(`--${level}`, '#888');
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
