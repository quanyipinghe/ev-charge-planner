import {
  type SegmentLevel,
  type Tariff,
  type TariffInterval,
  type TariffSeason,
  type TariffTier,
  expandWindows,
} from '@evcp/models';
import { MS_PER_MINUTE, type Interval, ceilToMinute, floorToMinute, localParts } from './time';

/** A stretch of wall-clock time during which the price per kWh is constant. */
export interface PriceBand {
  start: number;
  end: number;
  level: SegmentLevel;
  price: number;
}

const expandedWindowsCache = new WeakMap<TariffSeason, TariffInterval[]>();

function seasonIntervals(season: TariffSeason): TariffInterval[] {
  let intervals = expandedWindowsCache.get(season);
  if (!intervals) {
    intervals = expandWindows(season.windows);
    expandedWindowsCache.set(season, intervals);
  }
  return intervals;
}

/**
 * Picks the schedule that applies on a given day. A season restricted to weekdays or
 * weekends wins over an unrestricted one covering the same month.
 */
export function selectSeason(
  tariff: Tariff,
  month: number,
  dayType: 'weekday' | 'weekend',
): TariffSeason | undefined {
  const inMonth = tariff.seasons.filter((s) => s.months.includes(month));
  return (
    inMonth.find((s) => s.dayTypes?.includes(dayType)) ??
    inMonth.find((s) => !s.dayTypes) ??
    tariff.seasons[0]
  );
}

export interface PricePoint {
  level: SegmentLevel;
  price: number;
}

/** Time-of-use price at an instant, before tier surcharges and service fees. */
export function priceAt(instant: number, tariff: Tariff, timeZone: string): PricePoint {
  const parts = localParts(instant, timeZone);
  const dayType = parts.weekday === 0 || parts.weekday === 6 ? 'weekend' : 'weekday';
  const season = selectSeason(tariff, parts.month, dayType);
  const intervals = season ? seasonIntervals(season) : [];
  const match = intervals.find(
    (i) => parts.minuteOfDay >= i.startMin && parts.minuteOfDay < i.endMin,
  );
  return { level: match?.level ?? 'unknown', price: match?.price ?? 0 };
}

/**
 * Per-kWh surcharge that applies once monthly household consumption reaches
 * `cumulativeKwh` (中国居民阶梯电价).
 */
export function tierDeltaFor(
  cumulativeKwh: number,
  tiers: readonly TariffTier[] | undefined,
): number {
  if (!tiers?.length) return 0;
  for (const tier of tiers) {
    if (tier.upToKwh === null || cumulativeKwh < tier.upToKwh) return tier.delta;
  }
  return tiers.at(-1)?.delta ?? 0;
}

/** Never scan more than this, however wide the requested bounds are. */
const MAX_TIMELINE_MINUTES = 14 * 24 * 60;

/**
 * Splits a span of time into constant-price bands.
 *
 * Built by sampling each minute and merging equal neighbours: tariff windows are
 * minute-granular, so this is exact, and it doubles as the data the UI shades the
 * SOC chart with.
 */
export function buildPriceTimeline(
  bounds: Interval,
  tariff: Tariff | null,
  timeZone: string,
): PriceBand[] {
  const start = floorToMinute(bounds.start);
  const end = ceilToMinute(bounds.end);
  if (end <= start) return [];
  if (!tariff) return [{ start, end, level: 'unknown', price: 0 }];

  const minutes = Math.min((end - start) / MS_PER_MINUTE, MAX_TIMELINE_MINUTES);
  const bands: PriceBand[] = [];

  for (let i = 0; i < minutes; i += 1) {
    const instant = start + i * MS_PER_MINUTE;
    const { level, price } = priceAt(instant, tariff, timeZone);
    const last = bands.at(-1);
    if (last && last.level === level && last.price === price) {
      last.end = instant + MS_PER_MINUTE;
    } else {
      bands.push({ start: instant, end: instant + MS_PER_MINUTE, level, price });
    }
  }

  const last = bands.at(-1);
  if (last) last.end = Math.max(last.end, end);
  return bands;
}

/**
 * Instants inside `bounds` at which the price changes.
 *
 * The cheapest fixed-length session always starts either at a window edge, ends at
 * one, or sits against the edge of the availability window — so these few candidates
 * replace an exhaustive minute-by-minute search.
 */
export function priceChangeInstants(
  bounds: Interval,
  tariff: Tariff | null,
  timeZone: string,
): number[] {
  return buildPriceTimeline(bounds, tariff, timeZone)
    .map((band) => band.start)
    .filter((instant) => instant > bounds.start && instant < bounds.end);
}
