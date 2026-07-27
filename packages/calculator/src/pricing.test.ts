import { describe, expect, it } from 'vitest';
import { findCoverageIssue, validatedTariffSchema } from '@evcp/models';
import { buildPriceTimeline, priceAt, priceChangeInstants, selectSeason, tierDeltaFor } from './pricing';
import { priceSlices } from './cost';
import { runCharge } from './simulate';
import { MS_PER_MINUTE } from './time';
import { TZ, shanghai, tieredTariff, touTariff, yuanUp } from './fixtures';

describe('window coverage', () => {
  it('accepts a schedule that tiles the day including a midnight wrap', () => {
    expect(findCoverageIssue(touTariff.seasons[0]!.windows)).toBeNull();
  });

  it('rejects a gap', () => {
    const issue = findCoverageIssue([
      { level: 'valley', from: '23:00', to: '07:00', price: 0.3 },
      { level: 'peak', from: '08:00', to: '23:00', price: 0.9 },
    ]);
    expect(issue).toMatch(/uncovered/);
  });

  it('rejects an overlap', () => {
    const issue = findCoverageIssue([
      { level: 'valley', from: '00:00', to: '12:00', price: 0.3 },
      { level: 'peak', from: '10:00', to: '24:00', price: 0.9 },
    ]);
    expect(issue).toMatch(/overlap/);
  });

  it('is enforced when parsing a tariff', () => {
    const broken = {
      ...touTariff,
      seasons: [{ months: [1], windows: [{ level: 'flat', from: '00:00', to: '12:00', price: 0.5 }] }],
    };
    expect(validatedTariffSchema.safeParse(broken).success).toBe(false);
  });
});

describe('priceAt', () => {
  it('prices the hours on either side of midnight as valley', () => {
    expect(priceAt(shanghai(2026, 7, 27, 23, 30), touTariff, TZ)).toEqual({ level: 'valley', price: 0.3 });
    expect(priceAt(shanghai(2026, 7, 28, 2, 0), touTariff, TZ)).toEqual({ level: 'valley', price: 0.3 });
  });

  it('prices the window boundaries inclusively at the start', () => {
    expect(priceAt(shanghai(2026, 7, 27, 7, 0), touTariff, TZ).level).toBe('flat');
    expect(priceAt(shanghai(2026, 7, 27, 6, 59), touTariff, TZ).level).toBe('valley');
    expect(priceAt(shanghai(2026, 7, 27, 17, 0), touTariff, TZ).level).toBe('peak');
  });

  it('picks the weekend schedule when one is defined', () => {
    const weekendAware = {
      ...touTariff,
      seasons: [
        ...touTariff.seasons,
        {
          months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
          dayTypes: ['weekend' as const],
          windows: [{ level: 'valley' as const, from: '00:00', to: '24:00', price: 0.25 }],
        },
      ],
    };
    // 2026-08-01 is a Saturday.
    expect(priceAt(shanghai(2026, 8, 1, 19, 0), weekendAware, TZ).price).toBe(0.25);
    // 2026-07-27 is a Monday.
    expect(priceAt(shanghai(2026, 7, 27, 19, 0), weekendAware, TZ).price).toBe(0.9);
  });

  it('falls back to the first season when no month matches', () => {
    const januaryOnly = { ...touTariff, seasons: [{ ...touTariff.seasons[0]!, months: [1] }] };
    expect(selectSeason(januaryOnly, 7, 'weekday')).toBe(januaryOnly.seasons[0]);
  });
});

describe('buildPriceTimeline', () => {
  it('splits an overnight span into valley and flat bands', () => {
    const start = shanghai(2026, 7, 27, 22);
    const bands = buildPriceTimeline({ start, end: start + 12 * 60 * MS_PER_MINUTE }, touTariff, TZ);
    expect(bands.map((b) => b.level)).toEqual(['peak', 'valley', 'flat']);
    expect(bands[1]?.start).toBe(shanghai(2026, 7, 27, 23));
    expect(bands[2]?.start).toBe(shanghai(2026, 7, 28, 7));
  });

  it('returns a single unknown band when there is no tariff', () => {
    const start = shanghai(2026, 7, 27, 22);
    const bands = buildPriceTimeline({ start, end: start + 60 * MS_PER_MINUTE }, null, TZ);
    expect(bands).toHaveLength(1);
    expect(bands[0]?.level).toBe('unknown');
  });

  it('reports each price change as a candidate instant', () => {
    const start = shanghai(2026, 7, 27, 22);
    const instants = priceChangeInstants({ start, end: start + 12 * 60 * MS_PER_MINUTE }, touTariff, TZ);
    expect(instants).toEqual([shanghai(2026, 7, 27, 23), shanghai(2026, 7, 28, 7)]);
  });
});

describe('tiered pricing', () => {
  it('returns the surcharge for the tier the household is currently in', () => {
    expect(tierDeltaFor(50, tieredTariff.tiers)).toBe(0);
    expect(tierDeltaFor(150, tieredTariff.tiers)).toBe(0.05);
    expect(tierDeltaFor(500, tieredTariff.tiers)).toBe(0.3);
  });

  it('returns nothing when the tariff has no tiers', () => {
    expect(tierDeltaFor(500, undefined)).toBe(0);
  });

  it('bills a session that crosses a tier boundary at both rates', () => {
    const start = shanghai(2026, 7, 27, 23);
    const run = runCharge(
      { vehicle: yuanUp, chargerPowerKw: 7, currentType: 'ac', efficiency: 0.92, startSoc: 35, targetSoc: 85 },
      [{ start, end: start + 8 * 60 * MS_PER_MINUTE }],
    );
    // Starting 90 kWh into the month, this ~24.5 kWh session crosses the 100 kWh step.
    const priced = priceSlices(run.slices, {
      tariff: tieredTariff,
      timeZone: TZ,
      monthlyKwhSoFar: 90,
    });
    expect(priced.cost.tierSurcharge).toBeGreaterThan(0);
    expect(priced.cost.tierSurcharge).toBeLessThan(run.gridKwh * 0.05);
    expect(priced.segments.length).toBeGreaterThan(1);
  });
});

describe('cost attribution', () => {
  it('charges the valley rate for a session that stays inside the valley window', () => {
    const start = shanghai(2026, 7, 27, 23);
    const run = runCharge(
      { vehicle: yuanUp, chargerPowerKw: 7, currentType: 'ac', efficiency: 0.92, startSoc: 35, targetSoc: 85 },
      [{ start, end: start + 8 * 60 * MS_PER_MINUTE }],
    );
    const priced = priceSlices(run.slices, { tariff: touTariff, timeZone: TZ });

    expect(priced.cost.total).toBeCloseTo(run.gridKwh * 0.3, 4);
    expect(priced.levelShare.valley).toBeCloseTo(1, 6);
    expect(priced.segments).toHaveLength(1);
  });

  it('splits a session that runs past the end of the valley window', () => {
    // Start at 05:00 so the session runs into the 07:00 flat window.
    const start = shanghai(2026, 7, 27, 5);
    const run = runCharge(
      { vehicle: yuanUp, chargerPowerKw: 7, currentType: 'ac', efficiency: 0.92, startSoc: 35, targetSoc: 85 },
      [{ start, end: start + 8 * 60 * MS_PER_MINUTE }],
    );
    const priced = priceSlices(run.slices, { tariff: touTariff, timeZone: TZ });

    expect(priced.segments.map((s) => s.level)).toEqual(['valley', 'flat']);
    expect(priced.levelShare.valley + priced.levelShare.flat).toBeCloseTo(1, 6);
    expect(priced.cost.effectivePricePerKwh).toBeGreaterThan(0.3);
    expect(priced.cost.effectivePricePerKwh).toBeLessThan(0.6);
    // The two segments must add back up to the whole session.
    const segmentKwh = priced.segments.reduce((sum, s) => sum + s.gridKwh, 0);
    expect(segmentKwh).toBeCloseTo(run.gridKwh, 3);
  });

  it('adds a per-kWh service fee on top', () => {
    const start = shanghai(2026, 7, 27, 23);
    const run = runCharge(
      { vehicle: yuanUp, chargerPowerKw: 7, currentType: 'ac', efficiency: 0.92, startSoc: 35, targetSoc: 40 },
      [{ start, end: start + 8 * 60 * MS_PER_MINUTE }],
    );
    const priced = priceSlices(run.slices, {
      tariff: touTariff,
      timeZone: TZ,
      serviceFeePerKwh: 0.4,
    });
    expect(priced.cost.serviceFee).toBeCloseTo(run.gridKwh * 0.4, 4);
    expect(priced.cost.total).toBeCloseTo(run.gridKwh * 0.7, 4);
  });

  it('produces an empty result for an empty run', () => {
    const priced = priceSlices([], { tariff: touTariff, timeZone: TZ });
    expect(priced.cost.total).toBe(0);
    expect(priced.segments).toHaveLength(0);
  });
});
