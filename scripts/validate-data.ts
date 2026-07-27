import { auditVehicles, loadTariffs, loadVehicles, type LoadIssue } from './data-io';

function report(label: string, issues: readonly LoadIssue[]): void {
  for (const issue of issues) {
    console.error(`✗ ${label}/${issue.file}: ${issue.message}`);
  }
}

const vehicles = loadVehicles();
const tariffs = loadTariffs();
const audit = auditVehicles(vehicles.records);

report('vehicles', vehicles.issues);
report('vehicles', audit);
report('tariffs', tariffs.issues);

const failures = vehicles.issues.length + tariffs.issues.length + audit.length;
if (failures > 0) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}

const unverified = [
  ...vehicles.records.filter((v) => !v.verified),
  ...tariffs.records.filter((t) => !t.verified),
].length;

console.log(`✓ ${vehicles.records.length} vehicles, ${tariffs.records.length} tariffs validated.`);
if (unverified > 0) {
  console.log(`  ${unverified} record(s) still marked unverified — see CONTRIBUTING.md.`);
}
