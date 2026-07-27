import { z } from 'zod';

/** Kebab-case identifier used for vehicles, tariffs, chargers. Stable across releases. */
export const idSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'id must be kebab-case (a-z, 0-9, hyphen)');

/** State of charge, in percent. */
export const socSchema = z.number().min(0).max(100);

/** Wall-clock time of day, `HH:mm` in 24h form. `24:00` is accepted as end-of-day. */
export const timeOfDaySchema = z
  .string()
  .regex(/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'expected HH:mm');

/** Calendar date, `YYYY-MM-DD`. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/** Epoch milliseconds. All instants in this project are stored this way. */
export const instantSchema = z.number().int().finite();

/** IANA time zone name, e.g. `Asia/Shanghai`. */
export const timeZoneSchema = z.string().min(1).default('Asia/Shanghai');

export const localeSchema = z.enum(['zh-CN', 'en', 'ja']);
export type Locale = z.infer<typeof localeSchema>;

export const currencySchema = z.string().length(3).default('CNY');

/**
 * Provenance metadata carried by every community-maintained record.
 *
 * `verified` stays `false` until a maintainer has confirmed the numbers against a
 * primary source, so the UI can tell users which figures to double-check.
 */
export const provenanceSchema = z.object({
  source: z.string().max(200).optional(),
  sourceUrl: z.string().url().optional(),
  verified: z.boolean().default(false),
  updatedAt: isoDateSchema.optional(),
});
export type Provenance = z.infer<typeof provenanceSchema>;

/** Minutes since midnight, `HH:mm` -> 0..1440. */
export function timeOfDayToMinutes(value: string): number {
  const [h = '0', m = '0'] = value.split(':');
  return Number(h) * 60 + Number(m);
}

/** 0..1440 -> `HH:mm` (1440 renders as `24:00`). */
export function minutesToTimeOfDay(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  if (Math.round(minutes) === 1440) return '24:00';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const MINUTES_PER_DAY = 1440;
