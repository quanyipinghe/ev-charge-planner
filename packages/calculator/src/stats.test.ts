import { describe, expect, it } from 'vitest';
import type { ChargeSession } from '@evcp/models';
import { energyByCurrentType, groupSessionsByMonth, summarizeSessions } from './stats';
import { compareScenarios, savingsVsPeak, tariffPriceSummary } from './compare';
import { planCharge } from './plan';
import { TZ, shanghai, touTariff, yuanUp } from './fixtures';
import { planInputSchema } from '@evcp/models';

function session(overrides: Partial<ChargeSession> = {}): ChargeSession {
  return {
    id: 'session-1',
    vehicleId: yuanUp.id,
    startAt: shanghai(2026, 7, 27, 23),
    endAt: shanghai(2026, 7, 28, 2),
    startSoc: 35,
    endSoc: 85,
    batteryKwh: 22.56,
    gridKwh: 24.52,
    cost: 7.36,
    currency: 'CNY',
    currentType: 'ac',
    chargerPowerKw: 7,
    fullCharge: false,
    createdAt: shanghai(2026, 7, 28, 2),
    ...overrides,
  };
}

describe('summarizeSessions', () => {
  it('returns zeroes for no sessions', () => {
    const stats = summarizeSessions([]);
    expect(stats.count).toBe(0);
    expect(stats.cost).toBe(0);
  });

  it('totals energy and cost and averages the rest', () => {
    const stats = summarizeSessions([
      session(),
      session({ id: 'session-2', endSoc: 95, cost: 10, gridKwh: 30, batteryKwh: 27.6 }),
    ]);
    expect(stats.count).toBe(2);
    expect(stats.gridKwh).toBeCloseTo(54.52, 2);
    expect(stats.cost).toBeCloseTo(17.36, 2);
    expect(stats.averageEndSoc).toBe(90);
    expect(stats.averageDurationMinutes).toBe(180);
  });

  it('counts equivalent full cycles against pack size', () => {
    const stats = summarizeSessions([session(), session({ id: 'b' })], () => 45.12);
    // 2 x 22.56 kWh into a 45.12 kWh pack is exactly one full cycle.
    expect(stats.equivalentFullCycles).toBeCloseTo(1, 3);
  });

  it('skips cycle counting when the pack size is unknown', () => {
    expect(summarizeSessions([session()]).equivalentFullCycles).toBe(0);
  });
});

describe('groupSessionsByMonth', () => {
  it('buckets by local calendar month, oldest first', () => {
    const groups = groupSessionsByMonth(
      [
        session({ id: 'a', startAt: shanghai(2026, 6, 15, 23) }),
        session({ id: 'b', startAt: shanghai(2026, 7, 3, 23) }),
        session({ id: 'c', startAt: shanghai(2026, 7, 20, 23) }),
      ],
      TZ,
    );
    expect(groups.map((g) => g.key)).toEqual(['2026-06', '2026-07']);
    expect(groups[1]?.stats.count).toBe(2);
  });

  it('uses the local day, not UTC', () => {
    // 2026-07-01 00:30 Shanghai is still 2026-06-30 in UTC.
    const groups = groupSessionsByMonth([session({ startAt: shanghai(2026, 7, 1, 0, 30) })], TZ);
    expect(groups[0]?.key).toBe('2026-07');
  });
});

describe('energyByCurrentType', () => {
  it('splits AC and DC energy', () => {
    const split = energyByCurrentType([
      session(),
      session({ id: 'dc', currentType: 'dc', gridKwh: 40 }),
    ]);
    expect(split.ac).toBeCloseTo(24.52, 2);
    expect(split.dc).toBeCloseTo(40, 2);
  });
});

describe('tariffPriceSummary', () => {
  it('reports a representative price per level', () => {
    const summary = tariffPriceSummary(touTariff);
    expect(summary.byLevel.valley).toBeCloseTo(0.3, 6);
    expect(summary.byLevel.peak).toBeCloseTo(0.9, 6);
    expect(summary.min).toBeCloseTo(0.3, 6);
    expect(summary.max).toBeCloseTo(0.9, 6);
  });

  it('handles a missing tariff', () => {
    expect(tariffPriceSummary(null).byLevel).toEqual({});
  });
});

describe('compareScenarios', () => {
  const plan = planCharge(
    planInputSchema.parse({
      vehicle: yuanUp,
      chargerPowerKw: 7,
      currentSoc: 35,
      targetSoc: 85,
      tariff: touTariff,
      strategy: 'balanced',
      plugInAt: shanghai(2026, 7, 27, 20),
      departAt: shanghai(2026, 7, 28, 8),
      timeZone: TZ,
    }),
  );

  it('shows the planned session as the baseline', () => {
    const planned = compareScenarios(plan, touTariff).find((s) => s.key === 'planned');
    expect(planned?.cost).toBeCloseTo(plan.cost.total, 2);
    expect(planned?.deltaVsPlanned).toBe(0);
  });

  it('shows peak-rate charging as more expensive', () => {
    const peak = compareScenarios(plan, touTariff).find((s) => s.key === 'peak');
    expect(peak?.available).toBe(true);
    expect(peak?.deltaVsPlanned).toBeGreaterThan(0);
    expect(peak?.cost).toBeCloseTo(plan.gridKwh * 0.9, 1);
  });

  it('shows public fast charging as far more expensive than charging at home', () => {
    const publicDc = compareScenarios(plan, touTariff).find((s) => s.key === 'publicDc');
    expect(publicDc?.cost).toBeGreaterThan(plan.cost.total * 3);
  });

  it('quantifies the saving against peak rates', () => {
    expect(savingsVsPeak(plan, touTariff)).toBeCloseTo(plan.gridKwh * 0.6, 1);
  });

  it('reports no saving when there is no tariff to compare against', () => {
    expect(savingsVsPeak(plan, null)).toBe(0);
  });
});
