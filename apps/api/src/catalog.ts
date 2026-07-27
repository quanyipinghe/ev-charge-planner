import type { Tariff, Vehicle } from '@evcp/models';
// Imported by relative path on purpose: this one file is the only place that reaches
// into the generated bundle, and a plain path resolves identically under tsx, tsup,
// wrangler and vitest without any per-tool alias configuration.
import vehiclesJson from '../../../data/dist/vehicles.json';
import tariffsJson from '../../../data/dist/tariffs.json';

/** Run `npm run build:data` before building or starting the API. */
export const VEHICLES = vehiclesJson as unknown as Vehicle[];
export const TARIFFS = tariffsJson as unknown as Tariff[];
