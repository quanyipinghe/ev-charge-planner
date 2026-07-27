import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import { type Tariff, type Vehicle, validatedTariffFileSchema, vehicleFileSchema } from '@evcp/models';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));
export const dataDir = join(repoRoot, 'data');
export const distDir = join(dataDir, 'dist');

export interface LoadIssue {
  file: string;
  message: string;
}

export interface LoadResult<T> {
  records: T[];
  issues: LoadIssue[];
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

/**
 * Reads and validates every JSON file in a data directory.
 *
 * Problems are collected rather than thrown so `validate-data` can report all of them
 * in one pass — a contributor fixing a pull request should not have to rerun the
 * script once per typo.
 */
function loadDirectory<T extends { id: string }>(
  dir: string,
  schema: z.ZodType<{ [key: string]: unknown }>,
  key: string,
): LoadResult<T> {
  const records: T[] = [];
  const issues: LoadIssue[] = [];
  const seen = new Map<string, string>();

  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();

  for (const name of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    } catch (error) {
      issues.push({ file: name, message: `invalid JSON: ${(error as Error).message}` });
      continue;
    }

    const result = schema.safeParse(raw);
    if (!result.success) {
      issues.push({
        file: name,
        message: `schema validation failed:\n${formatZodError(result.error)}`,
      });
      continue;
    }

    for (const record of result.data[key] as T[]) {
      const previous = seen.get(record.id);
      if (previous) {
        issues.push({
          file: name,
          message: `duplicate id "${record.id}" (already defined in ${previous})`,
        });
        continue;
      }
      seen.set(record.id, name);
      records.push(record);
    }
  }

  return { records, issues };
}

export function loadVehicles(): LoadResult<Vehicle> {
  return loadDirectory<Vehicle>(join(dataDir, 'vehicles'), vehicleFileSchema, 'vehicles');
}

export function loadTariffs(): LoadResult<Tariff> {
  return loadDirectory<Tariff>(join(dataDir, 'tariffs'), validatedTariffFileSchema, 'tariffs');
}

/** Sanity checks that the schema alone cannot express. */
export function auditVehicles(vehicles: readonly Vehicle[]): LoadIssue[] {
  const issues: LoadIssue[] = [];

  for (const vehicle of vehicles) {
    const label = vehicle.id;

    if (vehicle.usableCapacityKwh && vehicle.usableCapacityKwh > vehicle.batteryCapacityKwh) {
      issues.push({ file: label, message: 'usableCapacityKwh exceeds batteryCapacityKwh' });
    }
    if (vehicle.dcMaxKw > 0 && vehicle.dcMaxKw < vehicle.acMaxKw) {
      issues.push({ file: label, message: 'dcMaxKw is below acMaxKw — check the spec' });
    }

    if (vehicle.consumptionKwhPer100km && vehicle.cltcRangeKm) {
      // Consumption implied by the rating. CLTC is optimistic, so the real figure
      // should sit a little above it — a wide band still catches transcription slips.
      const implied = (vehicle.batteryCapacityKwh / vehicle.cltcRangeKm) * 100;
      if (vehicle.consumptionKwhPer100km < implied * 0.7) {
        issues.push({
          file: label,
          message: `consumption ${vehicle.consumptionKwhPer100km} kWh/100km is implausibly low for a ${vehicle.cltcRangeKm} km CLTC range`,
        });
      }
      if (vehicle.consumptionKwhPer100km > implied * 2) {
        issues.push({
          file: label,
          message: `consumption ${vehicle.consumptionKwhPer100km} kWh/100km is implausibly high for a ${vehicle.cltcRangeKm} km CLTC range`,
        });
      }
    }
  }

  return issues;
}
