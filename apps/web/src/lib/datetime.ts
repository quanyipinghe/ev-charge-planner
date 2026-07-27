const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = offsetFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    offsetFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Milliseconds the zone is ahead of UTC at a given instant (DST-aware). */
export function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = offsetFormatter(timeZone).formatToParts(new Date(instant));
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour) % 24,
    Number(lookup.minute),
    Number(lookup.second),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Epoch ms to the `YYYY-MM-DDTHH:mm` string an `<input type="datetime-local">` wants. */
export function toDateTimeInput(instant: number, timeZone: string): string {
  const shifted = new Date(instant + zoneOffsetMs(instant, timeZone));
  return shifted.toISOString().slice(0, 16);
}

/**
 * Reads a `datetime-local` value as wall-clock time in `timeZone`.
 *
 * The offset is resolved twice because the first guess uses the offset at the wrong
 * instant, which matters on the two days a year when a DST transition falls inside
 * the gap between the two.
 */
export function fromDateTimeInput(value: string, timeZone: string): number {
  const naive = Date.parse(`${value}:00.000Z`);
  if (Number.isNaN(naive)) return Date.now();
  let instant = naive - zoneOffsetMs(naive, timeZone);
  instant = naive - zoneOffsetMs(instant, timeZone);
  return instant;
}

/** Epoch ms to the `HH:mm` string a `<input type="time">` wants. */
export function toTimeInput(instant: number, timeZone: string): string {
  return toDateTimeInput(instant, timeZone).slice(11, 16);
}

/** Local midnight of the day containing `instant`. */
export function startOfLocalDay(instant: number, timeZone: string): number {
  const iso = toDateTimeInput(instant, timeZone).slice(0, 10);
  return fromDateTimeInput(`${iso}T00:00`, timeZone);
}

/** The next occurrence of a local wall-clock time, at least `minAheadMs` from now. */
export function nextLocalTime(
  from: number,
  timeZone: string,
  hour: number,
  minute = 0,
  minAheadMs = 0,
): number {
  const day = startOfLocalDay(from, timeZone);
  const iso = toDateTimeInput(day, timeZone).slice(0, 10);
  const today = fromDateTimeInput(
    `${iso}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    timeZone,
  );
  if (today >= from + minAheadMs) return today;

  const tomorrowIso = toDateTimeInput(day + 36 * 3_600_000, timeZone).slice(0, 10);
  return fromDateTimeInput(
    `${tomorrowIso}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    timeZone,
  );
}

export const roundToMinute = (instant: number): number => Math.round(instant / 60_000) * 60_000;

/** True when the two instants fall on different local calendar days. */
export function isNextDay(from: number, to: number, timeZone: string): boolean {
  return toDateTimeInput(from, timeZone).slice(0, 10) !== toDateTimeInput(to, timeZone).slice(0, 10);
}
