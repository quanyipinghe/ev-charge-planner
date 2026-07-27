import {
  type CurvePoint,
  type Vehicle,
  effectiveConsumption,
  isLfpFamily,
  usableCapacityKwh,
} from '@evcp/models';
import { interpolateCurve } from './power';
import { roundTo } from './cost';

/**
 * Range retention versus ambient temperature.
 *
 * Cold weather is the single biggest real-world range factor: cabin heating runs off
 * the pack and a cold pack is less efficient, which is why a winter commute can cost
 * a third more energy than the same drive in spring.
 */
const RANGE_TEMPERATURE_CURVE: readonly CurvePoint[] = [
  [-20, 0.55],
  [-10, 0.65],
  [0, 0.75],
  [10, 0.88],
  [20, 0.98],
  [25, 1],
  [30, 0.96],
  [40, 0.88],
];

/** Extra penalty for LFP packs, which lose more capacity in the cold. */
const LFP_COLD_PENALTY = 0.95;
const LFP_COLD_THRESHOLD = 5;
/** Climate control running hard costs roughly this much range on top. */
const HVAC_PENALTY = 0.92;

export function rangeTemperatureFactor(
  temperatureC: number | undefined,
  vehicle?: Vehicle,
): number {
  if (temperatureC === undefined) return 1;
  let factor = interpolateCurve(RANGE_TEMPERATURE_CURVE, temperatureC);
  if (vehicle && isLfpFamily(vehicle.batteryType) && temperatureC < LFP_COLD_THRESHOLD) {
    factor *= LFP_COLD_PENALTY;
  }
  return factor;
}

export interface RangeInput {
  vehicle: Vehicle;
  soc: number;
  /** SOC to keep in reserve; range is reported down to this level. */
  reserveSoc?: number;
  temperatureC?: number;
  hvacOn?: boolean;
  /** Overrides the vehicle's consumption figure, in kWh/100km. */
  consumptionKwhPer100km?: number;
}

/** Usable energy between the current SOC and the reserve floor. */
export function availableEnergyKwh(input: RangeInput): number {
  const usable = Math.max(0, input.soc - (input.reserveSoc ?? 0));
  return (usableCapacityKwh(input.vehicle) * usable) / 100;
}

/** Estimated remaining range in km, temperature- and climate-adjusted. */
export function estimateRangeKm(input: RangeInput): number {
  const consumption = input.consumptionKwhPer100km ?? effectiveConsumption(input.vehicle);
  if (consumption <= 0) return 0;

  let factor = rangeTemperatureFactor(input.temperatureC, input.vehicle);
  if (input.hvacOn) factor *= HVAC_PENALTY;

  const km = (availableEnergyKwh(input) / consumption) * 100 * factor;
  return roundTo(Math.max(0, km), 1);
}

export interface TripInput {
  vehicle: Vehicle;
  distanceKm: number;
  /** Doubles the distance — the common "there and back" case. */
  roundTrip?: boolean;
  /** SOC to still have left on arrival. */
  reserveSoc?: number;
  temperatureC?: number;
  hvacOn?: boolean;
  consumptionKwhPer100km?: number;
}

/**
 * The SOC a trip actually needs, so the target can be set from a distance rather
 * than guessed. Returns a value clamped to 0-100; anything at 100 means the trip
 * needs a charging stop.
 */
export function requiredSocForTrip(input: TripInput): number {
  const distance = input.distanceKm * (input.roundTrip ? 2 : 1);
  const consumption = input.consumptionKwhPer100km ?? effectiveConsumption(input.vehicle);

  let factor = rangeTemperatureFactor(input.temperatureC, input.vehicle);
  if (input.hvacOn) factor *= HVAC_PENALTY;
  if (factor <= 0) return 100;

  const energyKwh = (distance / 100) * consumption / factor;
  const socNeeded = (energyKwh / usableCapacityKwh(input.vehicle)) * 100;
  return roundTo(Math.min(100, Math.max(0, socNeeded + (input.reserveSoc ?? 15))), 1);
}

/** True when the trip cannot be done on a single full charge. */
export function tripNeedsStop(input: TripInput): boolean {
  return requiredSocForTrip({ ...input, reserveSoc: input.reserveSoc ?? 15 }) >= 100;
}
