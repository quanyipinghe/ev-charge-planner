export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;

export interface Interval {
  /** Epoch ms, inclusive. */
  start: number;
  /** Epoch ms, exclusive. */
  end: number;
}

export const floorToMinute = (instant: number): number =>
  Math.floor(instant / MS_PER_MINUTE) * MS_PER_MINUTE;

export const ceilToMinute = (instant: number): number =>
  Math.ceil(instant / MS_PER_MINUTE) * MS_PER_MINUTE;

export const durationMinutes = (interval: Interval): number =>
  (interval.end - interval.start) / MS_PER_MINUTE;

/** Sorts, drops empty spans and merges anything touching or overlapping. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/** Restricts every interval to `[start, end)`, dropping those that fall outside. */
export function clipIntervals(intervals: readonly Interval[], bounds: Interval): Interval[] {
  return intervals
    .map((i) => ({ start: Math.max(i.start, bounds.start), end: Math.min(i.end, bounds.end) }))
    .filter((i) => i.end > i.start);
}

export const totalMinutes = (intervals: readonly Interval[]): number =>
  intervals.reduce((sum, i) => sum + durationMinutes(i), 0);

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday. */
  weekday: number;
  /** Minutes since local midnight. */
  minuteOfDay: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// Constructing an Intl.DateTimeFormat is expensive relative to a minute-by-minute
// simulation loop, so formatters are reused per time zone.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Wall-clock breakdown of an instant in an IANA time zone.
 *
 * Uses `Intl` rather than a date library so the engine stays dependency-free and
 * handles DST transitions correctly on every runtime we target.
 */
export function localParts(instant: number, timeZone: string): LocalParts {
  const parts = getFormatter(timeZone).formatToParts(new Date(instant));
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }
  // Some engines emit hour "24" for midnight when hour12 is false.
  const hour = Number(lookup.hour ?? '0') % 24;
  const minute = Number(lookup.minute ?? '0');
  return {
    year: Number(lookup.year ?? '1970'),
    month: Number(lookup.month ?? '1'),
    day: Number(lookup.day ?? '1'),
    hour,
    minute,
    weekday: WEEKDAY_INDEX[lookup.weekday ?? 'Thu'] ?? 4,
    minuteOfDay: hour * 60 + minute,
  };
}

/** True when the instant falls on a different local calendar day than `reference`. */
export function crossesLocalMidnight(
  reference: number,
  instant: number,
  timeZone: string,
): boolean {
  const a = localParts(reference, timeZone);
  const b = localParts(instant, timeZone);
  return a.year !== b.year || a.month !== b.month || a.day !== b.day;
}
