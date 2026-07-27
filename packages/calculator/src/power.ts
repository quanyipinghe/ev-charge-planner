import { type BatteryChemistry, type CurrentType, type CurvePoint, type Vehicle, isLfpFamily } from '@evcp/models';

/**
 * Above this SOC an AC session starts constant-voltage tapering. Below it the
 * on-board charger holds steady power, which is why home charging is close to linear.
 */
export const AC_TAPER_START_SOC = 92;
/** Fraction of nominal AC power still flowing at 100% SOC. */
export const AC_TAPER_END_FACTOR = 0.25;

/**
 * Normalised DC power curves — `[soc%, fraction of peak power]`.
 *
 * LFP holds a longer plateau but falls off a cliff past 80%; NMC/NCA start tapering
 * earlier and more gradually. Both dip slightly at very low SOC, matching real sessions.
 * Individual vehicles can override this with `vehicle.dcCurve`.
 */
export const DC_CURVE_LFP: readonly CurvePoint[] = [
  [0, 0.85],
  [10, 1],
  [40, 1],
  [55, 0.9],
  [70, 0.65],
  [80, 0.45],
  [90, 0.22],
  [95, 0.12],
  [100, 0.06],
];

export const DC_CURVE_NMC: readonly CurvePoint[] = [
  [0, 0.85],
  [10, 1],
  [30, 1],
  [50, 0.82],
  [65, 0.62],
  [80, 0.4],
  [90, 0.2],
  [95, 0.1],
  [100, 0.05],
];

export function defaultDcCurve(chemistry: BatteryChemistry): readonly CurvePoint[] {
  return isLfpFamily(chemistry) ? DC_CURVE_LFP : DC_CURVE_NMC;
}

/** Piecewise-linear lookup, clamped at both ends. */
export function interpolateCurve(curve: readonly CurvePoint[], soc: number): number {
  const first = curve[0];
  const last = curve.at(-1);
  if (!first || !last) return 1;
  if (soc <= first[0]) return first[1];
  if (soc >= last[0]) return last[1];
  for (let i = 1; i < curve.length; i += 1) {
    const prev = curve[i - 1] as CurvePoint;
    const next = curve[i] as CurvePoint;
    if (soc <= next[0]) {
      const span = next[0] - prev[0];
      if (span <= 0) return next[1];
      const ratio = (soc - prev[0]) / span;
      return prev[1] + (next[1] - prev[1]) * ratio;
    }
  }
  return last[1];
}

/**
 * Cold-weather derate for DC fast charging. A cold pack cannot accept high current,
 * so a winter fast charge is dramatically slower than the same session in summer.
 * AC charging is barely affected in power terms — the cost shows up as efficiency loss.
 */
export function dcTemperatureFactor(temperatureC: number | undefined): number {
  if (temperatureC === undefined) return 1;
  const curve: readonly CurvePoint[] = [
    [-20, 0.25],
    [-10, 0.35],
    [0, 0.55],
    [10, 0.8],
    [20, 1],
    [35, 1],
    [45, 0.8],
  ];
  // The helper is named for SOC but is a plain x/y piecewise interpolation.
  return interpolateCurve(curve, temperatureC);
}

/**
 * Extra conversion and pack-heating losses in the cold, applied on top of the
 * user's nominal efficiency.
 */
export function efficiencyTemperatureFactor(temperatureC: number | undefined): number {
  if (temperatureC === undefined) return 1;
  const curve: readonly CurvePoint[] = [
    [-20, 0.75],
    [-10, 0.82],
    [0, 0.9],
    [10, 0.96],
    [20, 1],
    [35, 1],
    [45, 0.97],
  ];
  return interpolateCurve(curve, temperatureC);
}

export interface PowerInput {
  soc: number;
  chargerPowerKw: number;
  currentType: CurrentType;
  vehicle: Vehicle;
  temperatureC?: number;
}

/** The vehicle-side ceiling for a current type — the cap the charge point cannot exceed. */
export function vehiclePowerCeilingKw(vehicle: Vehicle, currentType: CurrentType): number {
  if (currentType === 'dc') {
    return vehicle.dcMaxKw > 0 ? vehicle.dcMaxKw : vehicle.acMaxKw;
  }
  return vehicle.acMaxKw;
}

/**
 * Grid-side power actually flowing at a given SOC.
 *
 * The clamp against the vehicle's own limit is the single most important rule here:
 * a 7kW wallbox feeding a car with a 6.6kW on-board charger delivers 6.6kW, and
 * ignoring that under-estimates every home charging session by several percent.
 */
export function effectivePowerKw({
  soc,
  chargerPowerKw,
  currentType,
  vehicle,
  temperatureC,
}: PowerInput): number {
  const nominal = Math.min(chargerPowerKw, vehiclePowerCeilingKw(vehicle, currentType));

  let taper: number;
  if (currentType === 'ac') {
    if (soc <= AC_TAPER_START_SOC) {
      taper = 1;
    } else {
      const ratio = (soc - AC_TAPER_START_SOC) / (100 - AC_TAPER_START_SOC);
      taper = 1 - (1 - AC_TAPER_END_FACTOR) * Math.min(1, ratio);
    }
  } else {
    taper = interpolateCurve(vehicle.dcCurve ?? defaultDcCurve(vehicle.batteryType), soc);
  }

  const temperature = currentType === 'dc' ? dcTemperatureFactor(temperatureC) : 1;
  return Math.max(nominal * taper * temperature, 0.05);
}

/** Nominal efficiency adjusted for ambient temperature, clamped to a sane band. */
export function effectiveEfficiency(nominal: number, temperatureC: number | undefined): number {
  return Math.min(0.995, Math.max(0.5, nominal * efficiencyTemperatureFactor(temperatureC)));
}

/** Sensible per-current-type defaults offered by the UI. */
export const DEFAULT_EFFICIENCY: Record<CurrentType, number> = { ac: 0.92, dc: 0.95 };
