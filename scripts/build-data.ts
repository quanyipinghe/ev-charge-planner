import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditVehicles, distDir, loadTariffs, loadVehicles } from './data-io';

/**
 * Merges the per-brand and per-region source files into the two bundles the web app
 * imports. Keeping the sources split keeps pull requests small and reviewable; the
 * app only ever sees the merged, sorted output.
 */
const vehicles = loadVehicles();
const tariffs = loadTariffs();
const issues = [...vehicles.issues, ...tariffs.issues, ...auditVehicles(vehicles.records)];

if (issues.length > 0) {
  for (const issue of issues) console.error(`✗ ${issue.file}: ${issue.message}`);
  console.error('\nRefusing to build a bundle from invalid data.');
  process.exit(1);
}

const sortedVehicles = [...vehicles.records].sort(
  (a, b) =>
    a.brand.localeCompare(b.brand) ||
    a.model.localeCompare(b.model) ||
    (a.variant ?? '').localeCompare(b.variant ?? ''),
);
const sortedTariffs = [...tariffs.records].sort((a, b) => a.id.localeCompare(b.id));

mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, 'vehicles.json'), `${JSON.stringify(sortedVehicles, null, 2)}\n`);
writeFileSync(join(distDir, 'tariffs.json'), `${JSON.stringify(sortedTariffs, null, 2)}\n`);

console.log(
  `✓ wrote data/dist/vehicles.json (${sortedVehicles.length}) and data/dist/tariffs.json (${sortedTariffs.length})`,
);
