import { z } from 'zod';
import { instantSchema, socSchema, timeZoneSchema } from './common';
import { currentTypeSchema } from './charger';
import { tariffLevelSchema, validatedTariffSchema } from './tariff';
import { vehicleSchema } from './vehicle';

/**
 * How the planner places the charging session inside the available window.
 *
 * - `asap`     — start immediately; simplest, worst for both cost and battery wear.
 * - `latest`   — finish just before departure, minimising time parked at high SOC.
 * - `cheapest` — pick the cheapest slots in the window, splitting if allowed.
 * - `balanced` — cheapest, tie-broken toward less high-SOC dwell time.
 */
export const strategySchema = z.enum(['asap', 'latest', 'cheapest', 'balanced']);
export type Strategy = z.infer<typeof strategySchema>;

export const planInputSchema = z.object({
  vehicle: vehicleSchema,
  chargerPowerKw: z.number().positive().max(600),
  currentType: currentTypeSchema.default('ac'),
  currentSoc: socSchema,
  targetSoc: socSchema,
  /** Grid-to-battery efficiency, 0-1. Defaults to a realistic AC home-charging figure. */
  efficiency: z.number().min(0.5).max(1).default(0.92),
  tariff: validatedTariffSchema.nullable().default(null),
  strategy: strategySchema.default('balanced'),
  /** When the car is plugged in — the earliest possible start. */
  plugInAt: instantSchema,
  /** When the car must be ready. Required for `latest`; bounds the cheap-slot search. */
  departAt: instantSchema.optional(),
  /** Safety margin between the planned finish and departure. */
  bufferMinutes: z.number().int().min(0).max(240).default(5),
  /** Allow splitting the session across several cheap windows. */
  allowSplit: z.boolean().default(false),
  timeZone: timeZoneSchema,
  /** Ambient temperature; derates DC power and AC efficiency when cold. */
  temperatureC: z.number().min(-50).max(60).optional(),
  /** Household kWh already consumed this month, for tiered-pricing lookup. */
  monthlyKwhSoFar: z.number().min(0).optional(),
  /** SOC above which parking is considered stressful for the pack. */
  highSocThreshold: socSchema.default(80),
});
export type PlanInput = z.infer<typeof planInputSchema>;

/** Machine-readable advisory. The UI renders `code` through i18n with `params`. */
export const warningSchema = z.object({
  code: z.string(),
  severity: z.enum(['info', 'warn', 'critical']),
  params: z.record(z.union([z.string(), z.number()])).optional(),
});
export type Warning = z.infer<typeof warningSchema>;

export interface ChargeSegment {
  startAt: number;
  endAt: number;
  level: 'valley' | 'flat' | 'peak' | 'sharp' | 'unknown';
  /** Energy drawn from the grid during this segment. */
  gridKwh: number;
  /** Energy that reached the battery during this segment. */
  batteryKwh: number;
  pricePerKwh: number;
  cost: number;
  startSoc: number;
  endSoc: number;
}

export interface SocCurvePoint {
  t: number;
  soc: number;
  powerKw: number;
}

export type LevelBreakdown = Record<'valley' | 'flat' | 'peak' | 'sharp' | 'unknown', number>;

export interface PlanCost {
  total: number;
  currency: string;
  byLevel: LevelBreakdown;
  /** Portion of `total` attributable to tiered-pricing surcharges. */
  tierSurcharge: number;
  /** Portion of `total` attributable to per-kWh service fees. */
  serviceFee: number;
  /** `total / gridKwh`, i.e. what this session actually cost per kWh. */
  effectivePricePerKwh: number;
}

export interface ChargePlan {
  /** False when the window cannot reach `targetSoc`; `reachableSoc` says how far it gets. */
  feasible: boolean;
  reachableSoc: number;
  strategy: Strategy;

  startAt: number;
  endAt: number;
  /** Wall-clock span from first to last segment, including idle gaps when split. */
  spanMinutes: number;
  /** Time actually spent charging. Equals `spanMinutes` for a continuous session. */
  chargingMinutes: number;
  crossesMidnight: boolean;

  startSoc: number;
  endSoc: number;
  batteryKwh: number;
  gridKwh: number;
  lossKwh: number;

  segments: ChargeSegment[];
  socCurve: SocCurvePoint[];
  cost: PlanCost;
  /** Share of grid energy taken in each tariff level; values sum to 1. */
  levelShare: LevelBreakdown;
  /** Minutes spent above `highSocThreshold` between finishing and departure. */
  highSocDwellMinutes: number;
  warnings: Warning[];
}

export const emptyLevelBreakdown = (): LevelBreakdown => ({
  valley: 0,
  flat: 0,
  peak: 0,
  sharp: 0,
  unknown: 0,
});

export const segmentLevelSchema = z.union([tariffLevelSchema, z.literal('unknown')]);
export type SegmentLevel = z.infer<typeof segmentLevelSchema>;
