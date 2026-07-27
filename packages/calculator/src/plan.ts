import {
  type ChargePlan,
  type PlanInput,
  type SocCurvePoint,
  type Warning,
  emptyLevelBreakdown,
  usableCapacityKwh,
} from '@evcp/models';
import { type PricingContext, priceSlices, roundTo } from './cost';
import { vehiclePowerCeilingKw } from './power';
import { priceAt, priceChangeInstants } from './pricing';
import { type ChargeRun, type ChargeSlice, type RunOptions, chargeDurationMinutes, runCharge } from './simulate';
import {
  MS_PER_MINUTE,
  type Interval,
  crossesLocalMidnight,
  floorToMinute,
  mergeIntervals,
} from './time';

/** How far ahead to look when the user gives no departure time. */
const OPEN_HORIZON_MINUTES = 7 * 24 * 60;
/** Cost optimisation without a deadline would happily wait days; keep it to half a day. */
const COST_HORIZON_MINUTES = 12 * 60;
const SLOT_MINUTES = 5;
/** `balanced` treats candidates within this relative cost of the best as equivalent. */
const BALANCED_COST_TOLERANCE = 0.02;
/** Dwell above this many minutes at high SOC is worth warning about. */
const HIGH_SOC_DWELL_WARN_MINUTES = 8 * 60;
const MAX_CURVE_POINTS = 500;

function buildRunOptions(input: PlanInput): RunOptions {
  return {
    vehicle: input.vehicle,
    chargerPowerKw: input.chargerPowerKw,
    currentType: input.currentType,
    efficiency: input.efficiency,
    temperatureC: input.temperatureC,
    startSoc: input.currentSoc,
    targetSoc: input.targetSoc,
  };
}

function pricingContext(input: PlanInput): PricingContext {
  return {
    tariff: input.tariff,
    timeZone: input.timeZone,
    monthlyKwhSoFar: input.monthlyKwhSoFar,
  };
}

/** Contiguous stretches of actual charging, used to detect split schedules. */
function chargingBlocks(slices: readonly ChargeSlice[]): Interval[] {
  return mergeIntervals(slices.map((s) => ({ start: s.startAt, end: s.endAt })));
}

/**
 * Candidate start times for a continuous session.
 *
 * The cost of a fixed-length block is piecewise-linear in its start time, so the
 * optimum always sits at the availability window's edge or where the block's start
 * or end lines up with a price change. That turns a 720-point sweep into ~20 checks.
 */
function contiguousCandidates(
  window: Interval,
  durationMs: number,
  input: PlanInput,
): number[] {
  const latestStart = floorToMinute(window.end - durationMs);
  const upper = Math.max(window.start, latestStart);
  const candidates = new Set<number>([window.start, upper]);

  for (const boundary of priceChangeInstants(window, input.tariff, input.timeZone)) {
    candidates.add(boundary);
    candidates.add(boundary - durationMs);
  }

  return [...candidates]
    .map((instant) => floorToMinute(Math.min(Math.max(instant, window.start), upper)))
    .filter((instant, index, all) => all.indexOf(instant) === index)
    .sort((a, b) => a - b);
}

interface Attempt {
  run: ChargeRun;
  cost: number;
  startAt: number;
}

function evaluate(startAt: number, window: Interval, input: PlanInput): Attempt {
  const run = runCharge(buildRunOptions(input), [{ start: startAt, end: window.end }]);
  const priced = priceSlices(run.slices, pricingContext(input));
  return { run, cost: priced.cost.total, startAt };
}

function pickContiguous(window: Interval, durationMs: number, input: PlanInput): ChargeRun {
  const attempts = contiguousCandidates(window, durationMs, input).map((startAt) =>
    evaluate(startAt, window, input),
  );
  const reaching = attempts.filter((a) => a.run.reachedTarget);
  const pool = reaching.length > 0 ? reaching : attempts;
  if (pool.length === 0) return evaluate(window.start, window, input).run;

  const best = pool.reduce((a, b) => (b.cost < a.cost ? b : a));
  if (input.strategy !== 'balanced') return best.run;

  // Among near-equal-cost options prefer the latest start: same money, less time
  // sitting at a high state of charge.
  const threshold = best.cost * (1 + BALANCED_COST_TOLERANCE) + 1e-6;
  const latest = pool
    .filter((a) => a.cost <= threshold)
    .reduce((a, b) => (b.startAt > a.startAt ? b : a));
  return latest.run;
}

/**
 * Greedy cheapest-slot selection for split sessions.
 *
 * Power depends on SOC, so the energy a slot yields depends on the slots before it.
 * Selecting by price and then re-simulating chronologically — adding one more slot
 * until the target is met — respects that ordering while staying near-optimal.
 */
function pickSplit(window: Interval, durationMinutes: number, input: PlanInput): ChargeRun {
  const slots: Interval[] = [];
  for (let t = window.start; t < window.end; t += SLOT_MINUTES * MS_PER_MINUTE) {
    slots.push({ start: t, end: Math.min(t + SLOT_MINUTES * MS_PER_MINUTE, window.end) });
  }
  if (slots.length === 0) return runCharge(buildRunOptions(input), [window]);

  const ranked = slots
    .map((slot) => ({
      slot,
      price: input.tariff
        ? priceAt((slot.start + slot.end) / 2, input.tariff, input.timeZone).price
        : 0,
    }))
    // Cheapest first; among equal prices prefer the later slot so the session ends
    // closer to departure.
    .sort((a, b) => a.price - b.price || b.slot.start - a.slot.start)
    .map((entry) => entry.slot);

  let count = Math.min(ranked.length, Math.max(1, Math.ceil(durationMinutes / SLOT_MINUTES)));
  let run = runCharge(buildRunOptions(input), ranked.slice(0, count));
  while (!run.reachedTarget && count < ranked.length) {
    count += 1;
    run = runCharge(buildRunOptions(input), ranked.slice(0, count));
  }
  return run;
}

/** Interpolates the instant at which the session crosses `threshold`. */
function highSocCrossing(slices: readonly ChargeSlice[], threshold: number): number | null {
  for (const slice of slices) {
    if (slice.endSoc >= threshold) {
      const span = slice.endSoc - slice.startSoc;
      if (span <= 0) return slice.startAt;
      const ratio = Math.min(1, Math.max(0, (threshold - slice.startSoc) / span));
      return slice.startAt + (slice.endAt - slice.startAt) * ratio;
    }
  }
  return null;
}

function buildSocCurve(slices: readonly ChargeSlice[]): SocCurvePoint[] {
  if (slices.length === 0) return [];
  const stride = Math.max(1, Math.ceil(slices.length / MAX_CURVE_POINTS));
  const first = slices[0] as ChargeSlice;
  const points: SocCurvePoint[] = [
    { t: first.startAt, soc: roundTo(first.startSoc, 3), powerKw: roundTo(first.powerKw, 3) },
  ];

  for (let i = 0; i < slices.length; i += 1) {
    const slice = slices[i] as ChargeSlice;
    const next = slices[i + 1];
    const isGap = next !== undefined && next.startAt > slice.endAt + 1;
    if (i % stride !== 0 && !isGap && next !== undefined) continue;

    points.push({
      t: slice.endAt,
      soc: roundTo(slice.endSoc, 3),
      powerKw: roundTo(slice.powerKw, 3),
    });
    if (isGap) {
      // Flatten the SOC line while the session is paused.
      points.push({ t: slice.endAt, soc: roundTo(slice.endSoc, 3), powerKw: 0 });
      points.push({ t: next.startAt, soc: roundTo(slice.endSoc, 3), powerKw: 0 });
    }
  }
  return points;
}

function emptyPlan(input: PlanInput, warnings: Warning[]): ChargePlan {
  const at = floorToMinute(input.plugInAt);
  return {
    feasible: true,
    reachableSoc: input.currentSoc,
    strategy: input.strategy,
    startAt: at,
    endAt: at,
    spanMinutes: 0,
    chargingMinutes: 0,
    crossesMidnight: false,
    startSoc: input.currentSoc,
    endSoc: input.currentSoc,
    batteryKwh: 0,
    gridKwh: 0,
    lossKwh: 0,
    segments: [],
    socCurve: [],
    cost: {
      total: 0,
      currency: input.tariff?.currency ?? 'CNY',
      byLevel: emptyLevelBreakdown(),
      tierSurcharge: 0,
      serviceFee: 0,
      effectivePricePerKwh: 0,
    },
    levelShare: emptyLevelBreakdown(),
    highSocDwellMinutes: 0,
    warnings,
  };
}

/**
 * Turns a set of preferences into a concrete charging schedule: when to start, what
 * it costs, how the energy splits across tariff bands, and what it does to the pack.
 */
export function planCharge(input: PlanInput): ChargePlan {
  const warnings: Warning[] = [];

  const ceiling = vehiclePowerCeilingKw(input.vehicle, input.currentType);
  if (input.chargerPowerKw > ceiling + 1e-9) {
    warnings.push({
      code: 'charger-exceeds-vehicle',
      severity: 'info',
      params: { chargerKw: input.chargerPowerKw, vehicleKw: ceiling },
    });
  }
  if (!input.tariff) {
    warnings.push({ code: 'no-tariff', severity: 'info' });
  }
  if (input.temperatureC !== undefined && input.temperatureC < 5) {
    warnings.push({
      code: 'cold-charging',
      severity: 'info',
      params: { temperatureC: input.temperatureC },
    });
  }
  if (input.currentType === 'dc' && input.targetSoc > 80) {
    warnings.push({ code: 'dc-taper-past-80', severity: 'info' });
  }

  if (input.targetSoc <= input.currentSoc + 1e-9) {
    warnings.push({ code: 'target-not-above-current', severity: 'info' });
    return emptyPlan(input, warnings);
  }

  const plugIn = floorToMinute(input.plugInAt);
  const durationMinutes = chargeDurationMinutes(buildRunOptions(input));
  const durationMs = durationMinutes * MS_PER_MINUTE;

  let strategy = input.strategy;
  if (strategy === 'latest' && input.departAt === undefined) {
    warnings.push({ code: 'latest-needs-departure', severity: 'info' });
    strategy = 'asap';
  }

  const horizonMinutes =
    strategy === 'cheapest' || strategy === 'balanced' ? COST_HORIZON_MINUTES : OPEN_HORIZON_MINUTES;
  let windowEnd: number;
  if (input.departAt !== undefined) {
    windowEnd = floorToMinute(input.departAt) - input.bufferMinutes * MS_PER_MINUTE;
  } else {
    windowEnd = plugIn + horizonMinutes * MS_PER_MINUTE;
    if (strategy === 'cheapest' || strategy === 'balanced') {
      warnings.push({ code: 'no-departure-horizon', severity: 'info', params: { hours: 12 } });
    }
  }
  // A deadline at or before plug-in leaves no room at all; fall back to an immediate
  // session so the result still shows how far the car would get.
  const window: Interval = { start: plugIn, end: Math.max(windowEnd, plugIn + MS_PER_MINUTE) };
  const availableMinutes = (window.end - window.start) / MS_PER_MINUTE;

  let run: ChargeRun;
  switch (strategy) {
    case 'asap':
      run = runCharge(buildRunOptions(input), [window]);
      break;
    case 'latest': {
      const start = Math.max(window.start, floorToMinute(window.end - durationMs));
      run = runCharge(buildRunOptions(input), [{ start, end: window.end }]);
      break;
    }
    default:
      run = input.allowSplit
        ? pickSplit(window, durationMinutes, input)
        : pickContiguous(window, durationMs, input);
  }

  if (run.slices.length === 0) {
    warnings.push({
      code: 'window-too-short',
      severity: 'critical',
      params: {
        reachableSoc: roundTo(input.currentSoc, 1),
        neededMinutes: Math.round(durationMinutes),
        availableMinutes: Math.round(availableMinutes),
      },
    });
    return { ...emptyPlan(input, warnings), feasible: false };
  }

  const priced = priceSlices(run.slices, pricingContext(input));
  const blocks = chargingBlocks(run.slices);
  const startAt = (run.slices[0] as ChargeSlice).startAt;
  const endAt = (run.slices.at(-1) as ChargeSlice).endAt;

  if (!run.reachedTarget) {
    warnings.push({
      code: 'window-too-short',
      severity: 'critical',
      params: {
        reachableSoc: roundTo(run.endSoc, 1),
        neededMinutes: Math.round(durationMinutes),
        availableMinutes: Math.round(availableMinutes),
      },
    });
  }
  if (blocks.length > 1) {
    warnings.push({ code: 'split-schedule', severity: 'info', params: { blocks: blocks.length } });
  }

  const crossing = highSocCrossing(run.slices, input.highSocThreshold);
  const dwellReference = input.departAt ?? endAt;
  const highSocDwellMinutes =
    crossing === null ? 0 : Math.max(0, (dwellReference - crossing) / MS_PER_MINUTE);
  if (highSocDwellMinutes > HIGH_SOC_DWELL_WARN_MINUTES) {
    warnings.push({
      code: 'high-soc-dwell',
      severity: 'warn',
      params: {
        hours: roundTo(highSocDwellMinutes / 60, 1),
        threshold: input.highSocThreshold,
      },
    });
  }

  return {
    feasible: run.reachedTarget,
    reachableSoc: roundTo(run.endSoc, 2),
    strategy,
    startAt,
    endAt,
    spanMinutes: roundTo((endAt - startAt) / MS_PER_MINUTE, 1),
    chargingMinutes: roundTo(run.chargingMinutes, 1),
    crossesMidnight: crossesLocalMidnight(startAt, endAt, input.timeZone),
    startSoc: roundTo(input.currentSoc, 2),
    endSoc: roundTo(run.endSoc, 2),
    batteryKwh: roundTo(run.batteryKwh, 3),
    gridKwh: roundTo(run.gridKwh, 3),
    lossKwh: roundTo(run.gridKwh - run.batteryKwh, 3),
    segments: priced.segments,
    socCurve: buildSocCurve(run.slices),
    cost: priced.cost,
    levelShare: priced.levelShare,
    highSocDwellMinutes: roundTo(highSocDwellMinutes, 1),
    warnings,
  };
}

/** Energy the pack still needs, in kWh — the headline "补电量". */
export function energyNeededKwh(input: Pick<PlanInput, 'vehicle' | 'currentSoc' | 'targetSoc'>): number {
  const delta = Math.max(0, input.targetSoc - input.currentSoc);
  return (usableCapacityKwh(input.vehicle) * delta) / 100;
}
