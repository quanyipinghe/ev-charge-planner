import type { ChargeSession, SessionStats } from '@evcp/models';
import { MS_PER_MINUTE, localParts } from './time';
import { roundTo } from './cost';

const emptyStats = (): SessionStats => ({
  count: 0,
  batteryKwh: 0,
  gridKwh: 0,
  cost: 0,
  averageEndSoc: 0,
  averageDurationMinutes: 0,
  equivalentFullCycles: 0,
});

export type CapacityResolver = (vehicleId: string) => number | undefined;

/**
 * Rolls a set of sessions into the headline numbers shown on the statistics page.
 *
 * `equivalentFullCycles` divides the energy actually put into each pack by that
 * pack's size, which is the meaningful way to compare wear across different cars.
 */
export function summarizeSessions(
  sessions: readonly ChargeSession[],
  capacityOf?: CapacityResolver,
): SessionStats {
  if (sessions.length === 0) return emptyStats();

  let batteryKwh = 0;
  let gridKwh = 0;
  let cost = 0;
  let endSocSum = 0;
  let durationSum = 0;
  let cycles = 0;

  for (const session of sessions) {
    batteryKwh += session.batteryKwh;
    gridKwh += session.gridKwh;
    cost += session.cost;
    endSocSum += session.endSoc;
    durationSum += (session.endAt - session.startAt) / MS_PER_MINUTE;
    const capacity = capacityOf?.(session.vehicleId);
    if (capacity && capacity > 0) cycles += session.batteryKwh / capacity;
  }

  return {
    count: sessions.length,
    batteryKwh: roundTo(batteryKwh, 2),
    gridKwh: roundTo(gridKwh, 2),
    cost: roundTo(cost, 2),
    averageEndSoc: roundTo(endSocSum / sessions.length, 1),
    averageDurationMinutes: roundTo(durationSum / sessions.length, 1),
    equivalentFullCycles: roundTo(cycles, 2),
  };
}

export interface PeriodStats {
  /** `YYYY-MM` in the given time zone. */
  key: string;
  stats: SessionStats;
}

/** Groups sessions into local calendar months, oldest first. */
export function groupSessionsByMonth(
  sessions: readonly ChargeSession[],
  timeZone: string,
  capacityOf?: CapacityResolver,
): PeriodStats[] {
  const buckets = new Map<string, ChargeSession[]>();
  for (const session of sessions) {
    const parts = localParts(session.startAt, timeZone);
    const key = `${parts.year}-${String(parts.month).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(session);
    else buckets.set(key, [session]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => ({ key, stats: summarizeSessions(group, capacityOf) }));
}

/** Share of grid energy taken at each tariff level across a set of sessions. */
export function energyByCurrentType(
  sessions: readonly ChargeSession[],
): { ac: number; dc: number } {
  let ac = 0;
  let dc = 0;
  for (const session of sessions) {
    if (session.currentType === 'dc') dc += session.gridKwh;
    else ac += session.gridKwh;
  }
  return { ac: roundTo(ac, 2), dc: roundTo(dc, 2) };
}
