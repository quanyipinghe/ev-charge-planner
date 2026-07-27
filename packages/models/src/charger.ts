import { z } from 'zod';
import { idSchema } from './common';

export const currentTypeSchema = z.enum(['ac', 'dc']);
export type CurrentType = z.infer<typeof currentTypeSchema>;

export const chargerSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  nameZh: z.string().optional(),
  currentType: currentTypeSchema,
  /** Grid-side power the charge point can deliver, in kW. */
  powerKw: z.number().positive().max(600),
  /** Per-kWh service fee charged on top of electricity, typical for public DC. */
  serviceFeePerKwh: z.number().min(0).optional(),
  builtin: z.boolean().default(false),
});
export type Charger = z.infer<typeof chargerSchema>;

/** Charge points covering the common home and public options. */
export const BUILTIN_CHARGERS: readonly Charger[] = [
  { id: 'ac-3-3', name: '3.3kW AC', nameZh: '3.3kW 慢充', currentType: 'ac', powerKw: 3.3, builtin: true },
  { id: 'ac-7', name: '7kW AC', nameZh: '7kW 家充桩', currentType: 'ac', powerKw: 7, builtin: true },
  { id: 'ac-11', name: '11kW AC', nameZh: '11kW 三相', currentType: 'ac', powerKw: 11, builtin: true },
  { id: 'ac-20', name: '20kW AC', nameZh: '20kW 交流', currentType: 'ac', powerKw: 20, builtin: true },
  { id: 'dc-60', name: '60kW DC', nameZh: '60kW 直流', currentType: 'dc', powerKw: 60, builtin: true },
  { id: 'dc-120', name: '120kW DC', nameZh: '120kW 快充', currentType: 'dc', powerKw: 120, builtin: true },
  { id: 'dc-250', name: '250kW DC', nameZh: '250kW 超充', currentType: 'dc', powerKw: 250, builtin: true },
];
