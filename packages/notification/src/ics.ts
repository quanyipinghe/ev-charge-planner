export interface IcsEvent {
  /** Globally unique, stable per reminder so re-importing updates instead of duplicating. */
  uid: string;
  start: number;
  end?: number;
  summary: string;
  description?: string;
  location?: string;
  /** Minutes before the start at which the calendar should alert. */
  alarmMinutesBefore?: number;
}

export interface CalendarOptions {
  calendarName?: string;
  prodId?: string;
}

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

/** RFC 5545 UTC timestamp: `20260727T230000Z`. */
export function toIcsDate(instant: number): string {
  const date = new Date(instant);
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Escapes the characters that carry meaning inside an iCalendar TEXT value. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Folds a content line to 75 octets as the spec requires.
 *
 * Counting octets rather than characters matters here: Chinese and Japanese summaries
 * are three bytes per character, and a naive character-based fold produces files that
 * some calendar clients reject.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentBytes + size > limit) {
      parts.push(current);
      current = char;
      currentBytes = size;
      limit = 74; // continuation lines start with a space
    } else {
      current += char;
      currentBytes += size;
    }
  }
  parts.push(current);

  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join('\r\n');
}

/**
 * Builds an iCalendar file.
 *
 * This is the one notification channel that needs no server at all: a statically
 * hosted build can still put "start charging at 03:17" on the user's phone.
 */
export function buildCalendar(
  events: readonly IcsEvent[],
  options: CalendarOptions = {},
): string {
  const stamp = toIcsDate(Date.now());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${options.prodId ?? 'EVChargePlanner'}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (options.calendarName) {
    lines.push(`X-WR-CALNAME:${escapeIcsText(options.calendarName)}`);
  }

  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsDate(event.start)}`,
      `DTEND:${toIcsDate(event.end ?? event.start + 60_000)}`,
      `SUMMARY:${escapeIcsText(event.summary)}`,
    );
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    }
    if (event.alarmMinutesBefore !== undefined && event.alarmMinutesBefore > 0) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcsText(event.summary)}`,
        `TRIGGER:-PT${Math.round(event.alarmMinutesBefore)}M`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
