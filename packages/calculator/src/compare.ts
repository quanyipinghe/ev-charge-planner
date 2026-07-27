import type { ChargePlan, Tariff, TariffLevel } from '@evcp/models';
import { roundTo } from './cost';

export type ScenarioKey = 'planned' | 'valley' | 'peak' | 'publicDc';

export interface ScenarioResult {
  key: ScenarioKey;
  gridKwh: number;
  pricePerKwh: number;
  cost: number;
  /** Money this scenario costs on top of the planned session. Negative means cheaper. */
  deltaVsPlanned: number;
  /** False when the tariff has no window at this level, so the UI can hide it. */
  available: boolean;
}

export interface PriceSummary {
  min: number;
  max: number;
  byLevel: Partial<Record<TariffLevel, number>>;
}

/**
 * Representative price for each tariff level, averaged over every window that uses it.
 * Used for "what would this have cost at peak rates" comparisons rather than billing.
 */
export function tariffPriceSummary(tariff: Tariff | null): PriceSummary {
  if (!tariff) return { min: 0, max: 0, byLevel: {} };

  const sums = new Map<TariffLevel, { total: number; count: number }>();
  let min = Number.POSITIVE_INFINITY;
  let max = 0;

  for (const season of tariff.seasons) {
    for (const window of season.windows) {
      const entry = sums.get(window.level) ?? { total: 0, count: 0 };
      entry.total += window.price;
      entry.count += 1;
      sums.set(window.level, entry);
      min = Math.min(min, window.price);
      max = Math.max(max, window.price);
    }
  }

  const byLevel: Partial<Record<TariffLevel, number>> = {};
  for (const [level, entry] of sums) {
    byLevel[level] = roundTo(entry.total / entry.count, 6);
  }
  return { min: Number.isFinite(min) ? min : 0, max, byLevel };
}

export interface ComparisonOptions {
  /** All-in public fast-charging price including the service fee. */
  publicDcPricePerKwh?: number;
  /** DC charging skips the on-board charger, so it wastes a little less energy. */
  publicDcEfficiency?: number;
}

export const DEFAULT_PUBLIC_DC_PRICE = 1.5;
export const DEFAULT_PUBLIC_DC_EFFICIENCY = 0.95;

/**
 * Prices the same amount of energy under alternative scenarios, so the saving from
 * planning around the valley window is visible instead of implied.
 */
export function compareScenarios(
  plan: ChargePlan,
  tariff: Tariff | null,
  options: ComparisonOptions = {},
): ScenarioResult[] {
  const summary = tariffPriceSummary(tariff);
  const planned = plan.cost.total;
  const gridKwh = plan.gridKwh;

  const publicPrice = options.publicDcPricePerKwh ?? DEFAULT_PUBLIC_DC_PRICE;
  const publicEfficiency = options.publicDcEfficiency ?? DEFAULT_PUBLIC_DC_EFFICIENCY;
  const publicGridKwh = publicEfficiency > 0 ? plan.batteryKwh / publicEfficiency : 0;

  const make = (
    key: ScenarioKey,
    kwh: number,
    price: number | undefined,
    available: boolean,
  ): ScenarioResult => {
    const cost = available && price !== undefined ? kwh * price : 0;
    return {
      key,
      gridKwh: roundTo(kwh, 3),
      pricePerKwh: roundTo(price ?? 0, 6),
      cost: roundTo(cost, 2),
      deltaVsPlanned: roundTo(cost - planned, 2),
      available,
    };
  };

  const peakPrice = summary.byLevel.sharp ?? summary.byLevel.peak;
  const valleyPrice = summary.byLevel.valley;

  return [
    {
      key: 'planned',
      gridKwh: roundTo(gridKwh, 3),
      pricePerKwh: plan.cost.effectivePricePerKwh,
      cost: roundTo(planned, 2),
      deltaVsPlanned: 0,
      available: true,
    },
    make('valley', gridKwh, valleyPrice, valleyPrice !== undefined),
    make('peak', gridKwh, peakPrice, peakPrice !== undefined),
    make('publicDc', publicGridKwh, publicPrice, true),
  ];
}

/**
 * Money saved by charging as planned instead of at peak rates. Returns 0 when the
 * tariff has no peak window to compare against.
 */
export function savingsVsPeak(plan: ChargePlan, tariff: Tariff | null): number {
  const peak = compareScenarios(plan, tariff).find((s) => s.key === 'peak');
  return peak?.available ? Math.max(0, roundTo(peak.cost - plan.cost.total, 2)) : 0;
}
