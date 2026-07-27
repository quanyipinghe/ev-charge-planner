import { type CurrentType, type Vehicle, usableCapacityKwh } from '@evcp/models';
import { effectiveEfficiency, effectivePowerKw } from './power';
import { MS_PER_MINUTE, type Interval, mergeIntervals } from './time';

export interface RunOptions {
  vehicle: Vehicle;
  chargerPowerKw: number;
  currentType: CurrentType;
  /** Nominal grid-to-battery efficiency; temperature is applied on top. */
  efficiency: number;
  temperatureC?: number;
  startSoc: number;
  targetSoc: number;
}

/** One minute (or less, at the tail) of charging. */
export interface ChargeSlice {
  startAt: number;
  endAt: number;
  gridKwh: number;
  batteryKwh: number;
  startSoc: number;
  endSoc: number;
  powerKw: number;
}

export interface ChargeRun {
  reachedTarget: boolean;
  slices: ChargeSlice[];
  endSoc: number;
  /** Minutes with current actually flowing, excluding idle gaps between windows. */
  chargingMinutes: number;
  gridKwh: number;
  batteryKwh: number;
}

/** Guards against a pathological input turning the loop into an infinite one. */
const MAX_STEPS = 30 * 24 * 60;

/**
 * Advances a charging session minute by minute across the allowed windows.
 *
 * Stepping at one-minute resolution — rather than dividing energy by power once —
 * is what makes both the taper and the peak/valley cost split come out right: every
 * minute is priced in the tariff band it actually falls into. The final step is
 * shortened proportionally so the session lands exactly on the target SOC.
 */
export function runCharge(options: RunOptions, allowed: readonly Interval[]): ChargeRun {
  const capacity = usableCapacityKwh(options.vehicle);
  const efficiency = effectiveEfficiency(options.efficiency, options.temperatureC);
  const windows = mergeIntervals(allowed);

  const slices: ChargeSlice[] = [];
  let soc = options.startSoc;
  let gridKwh = 0;
  let batteryKwh = 0;
  let chargingMinutes = 0;
  let steps = 0;

  for (const window of windows) {
    let cursor = window.start;
    while (cursor < window.end && soc < options.targetSoc - 1e-9) {
      if ((steps += 1) > MAX_STEPS) break;

      const powerKw = effectivePowerKw({
        soc,
        chargerPowerKw: options.chargerPowerKw,
        currentType: options.currentType,
        vehicle: options.vehicle,
        temperatureC: options.temperatureC,
      });

      let minutes = Math.min(1, (window.end - cursor) / MS_PER_MINUTE);
      let stepGridKwh = (powerKw * minutes) / 60;
      let stepBatteryKwh = stepGridKwh * efficiency;
      let deltaSoc = (stepBatteryKwh / capacity) * 100;

      // Trim the last step so we stop exactly on target instead of overshooting.
      const remaining = options.targetSoc - soc;
      if (deltaSoc > remaining) {
        const scale = remaining / deltaSoc;
        minutes *= scale;
        stepGridKwh *= scale;
        stepBatteryKwh *= scale;
        deltaSoc = remaining;
      }

      const endAt = cursor + minutes * MS_PER_MINUTE;
      slices.push({
        startAt: cursor,
        endAt,
        gridKwh: stepGridKwh,
        batteryKwh: stepBatteryKwh,
        startSoc: soc,
        endSoc: soc + deltaSoc,
        powerKw,
      });

      soc += deltaSoc;
      gridKwh += stepGridKwh;
      batteryKwh += stepBatteryKwh;
      chargingMinutes += minutes;
      cursor = endAt;
    }
    if (soc >= options.targetSoc - 1e-9 || steps > MAX_STEPS) break;
  }

  return {
    reachedTarget: soc >= options.targetSoc - 1e-6,
    slices,
    endSoc: soc,
    chargingMinutes,
    gridKwh,
    batteryKwh,
  };
}

/** Horizon used when a run needs an effectively unbounded window. */
const OPEN_HORIZON_MS = 7 * 24 * 60 * MS_PER_MINUTE;

/**
 * Minutes of charging needed to go from `startSoc` to `targetSoc`.
 *
 * Power depends only on SOC, never on wall-clock time, so this duration is the same
 * wherever the session is placed — which is what lets `latest` scheduling simply
 * subtract it from the departure time instead of searching.
 */
export function chargeDurationMinutes(options: RunOptions): number {
  const anchor = 0;
  return runCharge(options, [{ start: anchor, end: anchor + OPEN_HORIZON_MS }]).chargingMinutes;
}

/** Runs a session with no upper bound on time, starting at `from`. */
export function runUnbounded(options: RunOptions, from: number): ChargeRun {
  return runCharge(options, [{ start: from, end: from + OPEN_HORIZON_MS }]);
}
