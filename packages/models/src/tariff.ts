import { z } from 'zod';
import {
  MINUTES_PER_DAY,
  currencySchema,
  idSchema,
  provenanceSchema,
  timeOfDaySchema,
  timeOfDayToMinutes,
} from './common';

/** 尖 / 峰 / 平 / 谷 — ordered cheapest-first for stable sorting. */
export const tariffLevelSchema = z.enum(['valley', 'flat', 'peak', 'sharp']);
export type TariffLevel = z.infer<typeof tariffLevelSchema>;

export const TARIFF_LEVELS: readonly TariffLevel[] = ['valley', 'flat', 'peak', 'sharp'];

export const dayTypeSchema = z.enum(['weekday', 'weekend']);
export type DayType = z.infer<typeof dayTypeSchema>;

export const tariffWindowSchema = z.object({
  level: tariffLevelSchema,
  /** Inclusive start, `HH:mm`. */
  from: timeOfDaySchema,
  /** Exclusive end, `HH:mm`. When `to <= from` the window wraps past midnight. */
  to: timeOfDaySchema,
  /** Price per kWh in the tariff currency. */
  price: z.number().min(0).max(100),
});
export type TariffWindow = z.infer<typeof tariffWindowSchema>;

export const tariffSeasonSchema = z.object({
  name: z.string().optional(),
  /** Calendar months (1-12) this schedule applies to. */
  months: z.array(z.number().int().min(1).max(12)).min(1),
  /** Restricts the schedule to weekdays or weekends; applies to every day when omitted. */
  dayTypes: z.array(dayTypeSchema).min(1).optional(),
  windows: z.array(tariffWindowSchema).min(1),
});
export type TariffSeason = z.infer<typeof tariffSeasonSchema>;

/**
 * Chinese residential electricity is billed in tiers ("阶梯电价"): once monthly
 * consumption passes a threshold, every further kWh costs a surcharge on top of
 * the time-of-use price.
 */
export const tariffTierSchema = z.object({
  /** Upper bound of this tier in kWh; `null` marks the open-ended top tier. */
  upToKwh: z.number().positive().nullable(),
  /** Surcharge added to the per-kWh price inside this tier. */
  delta: z.number().min(0),
});
export type TariffTier = z.infer<typeof tariffTierSchema>;

export const tariffSchema = provenanceSchema.extend({
  id: idSchema,
  name: z.string().min(1),
  nameEn: z.string().optional(),
  region: z.object({
    country: z.string().min(2).max(3),
    province: z.string().optional(),
    city: z.string().optional(),
  }),
  currency: currencySchema,
  seasons: z.array(tariffSeasonSchema).min(1),
  tiers: z.array(tariffTierSchema).min(1).optional(),
  /** Extra per-kWh service fee, used when modelling public charging stations. */
  serviceFeePerKwh: z.number().min(0).optional(),
});
export type Tariff = z.infer<typeof tariffSchema>;

export const tariffFileSchema = z.object({
  $schema: z.string().optional(),
  tariffs: z.array(tariffSchema).min(1),
});

export interface TariffInterval {
  /** Minutes since local midnight, inclusive. */
  startMin: number;
  /** Minutes since local midnight, exclusive. */
  endMin: number;
  level: TariffLevel;
  price: number;
}

/**
 * Flattens windows into non-wrapping intervals inside a single day, sorted by start.
 * A window that crosses midnight (`23:00 → 07:00`) becomes two intervals.
 */
export function expandWindows(windows: readonly TariffWindow[]): TariffInterval[] {
  const out: TariffInterval[] = [];
  for (const w of windows) {
    const from = timeOfDayToMinutes(w.from);
    let to = timeOfDayToMinutes(w.to);
    if (to === 0) to = MINUTES_PER_DAY; // midnight as an end bound means end-of-day
    if (to <= from) {
      out.push({ startMin: from, endMin: MINUTES_PER_DAY, level: w.level, price: w.price });
      if (to > 0) out.push({ startMin: 0, endMin: to, level: w.level, price: w.price });
    } else {
      out.push({ startMin: from, endMin: to, level: w.level, price: w.price });
    }
  }
  return out.sort((a, b) => a.startMin - b.startMin);
}

/**
 * Returns a human-readable problem when the windows do not tile a full 24h day
 * exactly once, or `null` when the schedule is sound. A gap would silently price
 * part of a charging session at zero, so this is enforced at parse time.
 */
export function findCoverageIssue(windows: readonly TariffWindow[]): string | null {
  const intervals = expandWindows(windows);
  let cursor = 0;
  for (const interval of intervals) {
    if (interval.startMin > cursor) {
      return `uncovered time range ${cursor}–${interval.startMin} min after midnight`;
    }
    if (interval.startMin < cursor) {
      return `overlapping windows at ${interval.startMin} min after midnight`;
    }
    cursor = interval.endMin;
  }
  return cursor === MINUTES_PER_DAY ? null : `uncovered time range ${cursor}–1440 min after midnight`;
}

/** `tariffSchema` plus the 24h-coverage invariant. Use this when loading data files. */
export const validatedTariffSchema = tariffSchema.superRefine((tariff, ctx) => {
  tariff.seasons.forEach((season, index) => {
    const issue = findCoverageIssue(season.windows);
    if (issue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['seasons', index, 'windows'],
        message: `windows must tile exactly 24 hours: ${issue}`,
      });
    }
  });

  if (tariff.tiers) {
    const openEnded = tariff.tiers.filter((t) => t.upToKwh === null);
    if (openEnded.length !== 1 || tariff.tiers.at(-1)?.upToKwh !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tiers'],
        message: 'the last tier (and only the last) must have upToKwh: null',
      });
    }
  }
});

export const validatedTariffFileSchema = z.object({
  $schema: z.string().optional(),
  tariffs: z.array(validatedTariffSchema).min(1),
});
