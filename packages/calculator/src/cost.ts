import {
  type ChargeSegment,
  type LevelBreakdown,
  type PlanCost,
  type SegmentLevel,
  type Tariff,
  emptyLevelBreakdown,
} from '@evcp/models';
import type { ChargeSlice } from './simulate';
import { type PriceBand, buildPriceTimeline, tierDeltaFor } from './pricing';

export interface PricingContext {
  tariff: Tariff | null;
  timeZone: string;
  /** Household consumption already billed this month, for tier lookup. */
  monthlyKwhSoFar?: number;
  /** Extra per-kWh fee, e.g. a public charging station's service charge. */
  serviceFeePerKwh?: number;
}

export interface PricedRun {
  segments: ChargeSegment[];
  cost: PlanCost;
  levelShare: LevelBreakdown;
  bands: PriceBand[];
}

/** Instants and money are floated through the maths and only rounded on the way out. */
const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function findBand(bands: readonly PriceBand[], instant: number, from: number): number {
  for (let i = from; i < bands.length; i += 1) {
    const band = bands[i] as PriceBand;
    if (instant < band.end) return i;
  }
  return Math.max(0, bands.length - 1);
}

/**
 * Attributes each minute of a run to its tariff band and totals the bill.
 *
 * Tier surcharges use the running monthly total as the session progresses, so a
 * session that pushes the household across a tier boundary is priced on both sides
 * of it rather than at a single flat rate.
 */
export function priceSlices(slices: readonly ChargeSlice[], ctx: PricingContext): PricedRun {
  const empty: PricedRun = {
    segments: [],
    cost: {
      total: 0,
      currency: ctx.tariff?.currency ?? 'CNY',
      byLevel: emptyLevelBreakdown(),
      tierSurcharge: 0,
      serviceFee: 0,
      effectivePricePerKwh: 0,
    },
    levelShare: emptyLevelBreakdown(),
    bands: [],
  };
  if (slices.length === 0) return empty;

  const first = slices[0] as ChargeSlice;
  const last = slices.at(-1) as ChargeSlice;
  const bands = buildPriceTimeline({ start: first.startAt, end: last.endAt }, ctx.tariff, ctx.timeZone);

  const serviceFee = ctx.serviceFeePerKwh ?? ctx.tariff?.serviceFeePerKwh ?? 0;
  const byLevelCost = emptyLevelBreakdown();
  const byLevelKwh = emptyLevelBreakdown();

  const segments: ChargeSegment[] = [];
  let cumulativeKwh = ctx.monthlyKwhSoFar ?? 0;
  let total = 0;
  let tierSurchargeTotal = 0;
  let serviceFeeTotal = 0;
  let totalGridKwh = 0;
  let bandIndex = 0;

  for (const slice of slices) {
    bandIndex = findBand(bands, slice.startAt, bandIndex);
    const band = bands[bandIndex];
    const level: SegmentLevel = band?.level ?? 'unknown';
    const basePrice = band?.price ?? 0;

    const tierDelta = tierDeltaFor(cumulativeKwh, ctx.tariff?.tiers);
    const pricePerKwh = basePrice + tierDelta + serviceFee;
    const sliceCost = slice.gridKwh * pricePerKwh;

    total += sliceCost;
    tierSurchargeTotal += slice.gridKwh * tierDelta;
    serviceFeeTotal += slice.gridKwh * serviceFee;
    totalGridKwh += slice.gridKwh;
    cumulativeKwh += slice.gridKwh;
    byLevelCost[level] += sliceCost;
    byLevelKwh[level] += slice.gridKwh;

    const open = segments.at(-1);
    // Merge adjacent minutes that share a price into one reportable segment.
    if (open && open.level === level && open.pricePerKwh === pricePerKwh && open.endAt === slice.startAt) {
      open.endAt = slice.endAt;
      open.gridKwh += slice.gridKwh;
      open.batteryKwh += slice.batteryKwh;
      open.cost += sliceCost;
      open.endSoc = slice.endSoc;
    } else {
      segments.push({
        startAt: slice.startAt,
        endAt: slice.endAt,
        level,
        gridKwh: slice.gridKwh,
        batteryKwh: slice.batteryKwh,
        pricePerKwh,
        cost: sliceCost,
        startSoc: slice.startSoc,
        endSoc: slice.endSoc,
      });
    }
  }

  const levelShare = emptyLevelBreakdown();
  for (const level of Object.keys(byLevelKwh) as SegmentLevel[]) {
    levelShare[level] = totalGridKwh > 0 ? byLevelKwh[level] / totalGridKwh : 0;
    byLevelCost[level] = round(byLevelCost[level], 4);
  }

  return {
    bands,
    segments: segments.map((s) => ({
      ...s,
      gridKwh: round(s.gridKwh, 4),
      batteryKwh: round(s.batteryKwh, 4),
      cost: round(s.cost, 4),
      pricePerKwh: round(s.pricePerKwh, 6),
      startSoc: round(s.startSoc, 3),
      endSoc: round(s.endSoc, 3),
    })),
    cost: {
      total: round(total, 4),
      currency: ctx.tariff?.currency ?? 'CNY',
      byLevel: byLevelCost,
      tierSurcharge: round(tierSurchargeTotal, 4),
      serviceFee: round(serviceFeeTotal, 4),
      effectivePricePerKwh: totalGridKwh > 0 ? round(total / totalGridKwh, 6) : 0,
    },
    levelShare,
  };
}

export { round as roundTo };
