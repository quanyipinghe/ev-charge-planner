import { z } from 'zod';
import { idSchema, provenanceSchema, socSchema } from './common';

/**
 * Cell chemistry. Drives charging-curve shape, cold-weather behaviour and the
 * health advice ruleset (LFP wants periodic full charges to recalibrate the BMS;
 * NMC/NCA prefer to live in the middle of the range).
 */
export const batteryChemistrySchema = z.enum(['LFP', 'LMFP', 'NMC', 'NCA', 'NAION']);
export type BatteryChemistry = z.infer<typeof batteryChemistrySchema>;

/** A point on a normalised charging curve: `[soc%, powerFraction]`. */
export const curvePointSchema = z.tuple([socSchema, z.number().min(0).max(1)]);
export type CurvePoint = z.infer<typeof curvePointSchema>;

export const chargeCurveSchema = z
  .array(curvePointSchema)
  .min(2)
  .refine(
    (points) => points.every((p, i) => i === 0 || p[0] > (points[i - 1] as CurvePoint)[0]),
    'curve points must be sorted by ascending SOC',
  );

export const vehicleSchema = provenanceSchema.extend({
  id: idSchema,
  brand: z.string().min(1),
  brandZh: z.string().min(1).optional(),
  model: z.string().min(1),
  modelZh: z.string().min(1).optional(),
  /** Trim / battery option, e.g. `401km 高续航版`. */
  variant: z.string().optional(),
  variantZh: z.string().optional(),
  year: z.number().int().min(2008).max(2100).optional(),

  /** Nameplate pack size in kWh. */
  batteryCapacityKwh: z.number().positive().max(300),
  /** Usable pack size in kWh; falls back to the nameplate figure when absent. */
  usableCapacityKwh: z.number().positive().max(300).optional(),
  batteryType: batteryChemistrySchema,

  /** On-board charger ceiling in kW — the real cap on home AC charging. */
  acMaxKw: z.number().positive().max(50),
  /** DC fast-charging peak in kW; 0 for vehicles without a DC inlet. */
  dcMaxKw: z.number().min(0).max(600),

  cltcRangeKm: z.number().positive().max(2000).optional(),
  wltpRangeKm: z.number().positive().max(2000).optional(),
  /** Real-world consumption used for range estimates. */
  consumptionKwhPer100km: z.number().positive().max(60).optional(),

  /** Optional per-vehicle DC taper curve; overrides the chemistry default. */
  dcCurve: chargeCurveSchema.optional(),
  /** Freeform tags, e.g. `800V`, `heat-pump`. */
  tags: z.array(z.string()).optional(),
});

export type Vehicle = z.infer<typeof vehicleSchema>;

export const vehicleFileSchema = z.object({
  $schema: z.string().optional(),
  vehicles: z.array(vehicleSchema).min(1),
});

/**
 * Chemistries that behave like LFP: flat voltage curve (so the BMS needs periodic
 * full charges to stay calibrated), tolerant of high SOC, weaker in the cold.
 */
export function isLfpFamily(chemistry: BatteryChemistry): boolean {
  return chemistry === 'LFP' || chemistry === 'LMFP' || chemistry === 'NAION';
}

/** Usable capacity with the documented fallback applied. */
export function usableCapacityKwh(vehicle: Vehicle): number {
  return vehicle.usableCapacityKwh ?? vehicle.batteryCapacityKwh;
}

/** Localised display name, e.g. `比亚迪 元UP 401km 高续航版`. */
export function vehicleDisplayName(vehicle: Vehicle, locale: 'zh-CN' | 'en' | 'ja'): string {
  const zh = locale === 'zh-CN';
  const brand = (zh && vehicle.brandZh) || vehicle.brand;
  const model = (zh && vehicle.modelZh) || vehicle.model;
  const variant = (zh && vehicle.variantZh) || vehicle.variant;
  return [brand, model, variant].filter(Boolean).join(' ');
}

/**
 * Consumption used for range maths. Prefers the measured figure, then derives one
 * from the CLTC rating (CLTC is optimistic, so it is discounted), then falls back
 * to a size-based guess.
 */
export function effectiveConsumption(vehicle: Vehicle): number {
  if (vehicle.consumptionKwhPer100km) return vehicle.consumptionKwhPer100km;
  if (vehicle.cltcRangeKm) {
    const cltc = (usableCapacityKwh(vehicle) / vehicle.cltcRangeKm) * 100;
    return cltc / CLTC_OPTIMISM;
  }
  return usableCapacityKwh(vehicle) > 70 ? 17 : 13;
}

/** CLTC range is roughly 15% higher than what drivers actually see. */
export const CLTC_OPTIMISM = 0.85;
