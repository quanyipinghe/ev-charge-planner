import { z } from 'zod';
import { currencySchema, instantSchema, socSchema } from './common';
import { currentTypeSchema } from './charger';

/** One completed (or logged) charging session, kept locally for statistics. */
export const chargeSessionSchema = z.object({
  id: z.string().min(1),
  vehicleId: z.string().min(1),
  startAt: instantSchema,
  endAt: instantSchema,
  startSoc: socSchema,
  endSoc: socSchema,
  batteryKwh: z.number().min(0),
  gridKwh: z.number().min(0),
  cost: z.number().min(0),
  currency: currencySchema,
  currentType: currentTypeSchema,
  chargerPowerKw: z.number().positive(),
  tariffId: z.string().optional(),
  /** Set when the session ended at 100%, used for LFP calibration tracking. */
  fullCharge: z.boolean().default(false),
  note: z.string().max(500).optional(),
  createdAt: instantSchema,
});
export type ChargeSession = z.infer<typeof chargeSessionSchema>;

export interface SessionStats {
  count: number;
  batteryKwh: number;
  gridKwh: number;
  cost: number;
  averageEndSoc: number;
  averageDurationMinutes: number;
  /** Equivalent full cycles, i.e. total energy divided by pack size. */
  equivalentFullCycles: number;
}
