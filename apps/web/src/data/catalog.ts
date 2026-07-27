import { BUILTIN_CHARGERS, type Charger, type Tariff, type Vehicle } from '@evcp/models';
import vehiclesJson from '@data/vehicles.json';
import tariffsJson from '@data/tariffs.json';

/**
 * The community-maintained database, merged at build time by `scripts/build-data.ts`
 * and already validated there — no need to re-parse it in the browser.
 */
export const CATALOG_VEHICLES = vehiclesJson as unknown as Vehicle[];
export const CATALOG_TARIFFS = tariffsJson as unknown as Tariff[];
export const CHARGERS: readonly Charger[] = BUILTIN_CHARGERS;

export const CATALOG_BRANDS: string[] = [
  ...new Set(CATALOG_VEHICLES.map((vehicle) => vehicle.brand)),
].sort();

/** Case-insensitive search across brand, model and variant in every language. */
export function searchVehicles(query: string): Vehicle[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return CATALOG_VEHICLES;
  return CATALOG_VEHICLES.filter((vehicle) =>
    [
      vehicle.brand,
      vehicle.brandZh,
      vehicle.model,
      vehicle.modelZh,
      vehicle.variant,
      vehicle.variantZh,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(needle),
  );
}
