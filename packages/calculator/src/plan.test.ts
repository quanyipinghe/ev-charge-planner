import { describe, expect, it } from 'vitest';
import { type PlanInput, planInputSchema } from '@evcp/models';
import { energyNeededKwh, planCharge } from './plan';
import { MS_PER_MINUTE, localParts } from './time';
import { TZ, shanghai, touTariff, yuanUp } from './fixtures';

/** Plug in at 20:00 on 2026-07-27, leave at 08:00 the next morning. */
const plugInAt = shanghai(2026, 7, 27, 20);
const departAt = shanghai(2026, 7, 28, 8);

function makeInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return planInputSchema.parse({
    vehicle: yuanUp,
    chargerPowerKw: 7,
    currentType: 'ac',
    currentSoc: 35,
    targetSoc: 85,
    efficiency: 0.92,
    tariff: touTariff,
    plugInAt,
    departAt,
    timeZone: TZ,
    ...overrides,
  });
}

const clock = (instant: number): string => {
  const parts = localParts(instant, TZ);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
};

describe('energyNeededKwh', () => {
  it('is capacity times the SOC gap', () => {
    expect(energyNeededKwh({ vehicle: yuanUp, currentSoc: 35, targetSoc: 85 })).toBeCloseTo(22.56, 6);
  });

  it('is zero when the target is already met', () => {
    expect(energyNeededKwh({ vehicle: yuanUp, currentSoc: 90, targetSoc: 85 })).toBe(0);
  });
});

describe('strategy: asap', () => {
  it('starts the moment the car is plugged in', () => {
    const plan = planCharge(makeInput({ strategy: 'asap' }));
    expect(plan.startAt).toBe(plugInAt);
    expect(clock(plan.startAt)).toBe('20:00');
    expect(plan.feasible).toBe(true);
  });

  it('pays peak rates because it charges through the evening', () => {
    const plan = planCharge(makeInput({ strategy: 'asap' }));
    expect(plan.levelShare.peak).toBeGreaterThan(0);
    expect(plan.cost.effectivePricePerKwh).toBeGreaterThan(0.3);
  });

  it('leaves the car sitting at high SOC all night', () => {
    const plan = planCharge(makeInput({ strategy: 'asap' }));
    expect(plan.highSocDwellMinutes).toBeGreaterThan(8 * 60);
    expect(plan.warnings.map((w) => w.code)).toContain('high-soc-dwell');
  });
});

describe('strategy: latest', () => {
  // The document's "smart reservation" example: leave at 08:00, so finish just before.
  it('finishes right on the buffer before departure', () => {
    const plan = planCharge(makeInput({ strategy: 'latest' }));
    const deadline = departAt - 5 * MS_PER_MINUTE;
    // The start is floored to a whole minute — a charger cannot be scheduled at
    // 04:12:04 — so the session lands just inside the deadline, never past it.
    expect(plan.endAt).toBeLessThanOrEqual(deadline);
    expect(deadline - plan.endAt).toBeLessThan(MS_PER_MINUTE);
  });

  it('backs the start time out of the required duration', () => {
    const plan = planCharge(makeInput({ strategy: 'latest' }));
    // 07:55 minus 3h43m.
    expect(clock(plan.startAt)).toBe('04:12');
    expect(plan.startAt % MS_PER_MINUTE).toBe(0);
    expect(plan.chargingMinutes).toBeCloseTo(222.9, 0);
  });

  it('minimises time parked at high SOC', () => {
    const latest = planCharge(makeInput({ strategy: 'latest' }));
    const asap = planCharge(makeInput({ strategy: 'asap' }));
    expect(latest.highSocDwellMinutes).toBeLessThan(asap.highSocDwellMinutes);
    expect(latest.highSocDwellMinutes).toBeLessThan(60);
  });

  it('falls back to charging immediately when no departure time is given', () => {
    const plan = planCharge(makeInput({ strategy: 'latest', departAt: undefined }));
    expect(plan.strategy).toBe('asap');
    expect(plan.warnings.map((w) => w.code)).toContain('latest-needs-departure');
  });
});

describe('strategy: cheapest', () => {
  it('waits for the valley window instead of starting at plug-in', () => {
    const plan = planCharge(makeInput({ strategy: 'cheapest' }));
    expect(clock(plan.startAt)).toBe('23:00');
    expect(plan.levelShare.valley).toBeCloseTo(1, 6);
    expect(plan.cost.total).toBeCloseTo(plan.gridKwh * 0.3, 3);
  });

  it('costs less than charging immediately', () => {
    const cheapest = planCharge(makeInput({ strategy: 'cheapest' }));
    const asap = planCharge(makeInput({ strategy: 'asap' }));
    expect(cheapest.cost.total).toBeLessThan(asap.cost.total);
  });

  it('reports crossing midnight', () => {
    const plan = planCharge(makeInput({ strategy: 'cheapest' }));
    expect(plan.crossesMidnight).toBe(true);
  });
});

describe('strategy: balanced', () => {
  it('matches the cheapest price but finishes as late as the valley window allows', () => {
    const balanced = planCharge(makeInput({ strategy: 'balanced' }));
    const cheapest = planCharge(makeInput({ strategy: 'cheapest' }));

    expect(balanced.cost.total).toBeCloseTo(cheapest.cost.total, 4);
    expect(balanced.startAt).toBeGreaterThan(cheapest.startAt);
    // Ends against the 07:00 valley boundary rather than at 02:43.
    expect(clock(balanced.startAt)).toBe('03:17');
    expect(shanghai(2026, 7, 28, 7) - balanced.endAt).toBeLessThan(MS_PER_MINUTE);
    expect(balanced.levelShare.valley).toBeCloseTo(1, 6);
    expect(balanced.highSocDwellMinutes).toBeLessThan(cheapest.highSocDwellMinutes);
  });
});

describe('split scheduling', () => {
  it('can pause and resume to stay inside the cheap window', () => {
    // Only five hours of valley are available, but the session needs 3h43m; make the
    // window tight enough that the optimiser has to be selective.
    const plan = planCharge(
      makeInput({ strategy: 'cheapest', allowSplit: true, targetSoc: 95 }),
    );
    expect(plan.feasible).toBe(true);
    expect(plan.levelShare.valley).toBeGreaterThan(0.9);
  });

  it('flags a schedule that is broken into several blocks', () => {
    const plan = planCharge(
      makeInput({
        strategy: 'cheapest',
        allowSplit: true,
        plugInAt: shanghai(2026, 7, 27, 15),
        departAt: shanghai(2026, 7, 28, 8),
        targetSoc: 100,
      }),
    );
    const codes = plan.warnings.map((w) => w.code);
    if (plan.segments.length > 1) {
      expect(codes.some((c) => c === 'split-schedule' || c === 'window-too-short')).toBe(true);
    }
    expect(plan.levelShare.peak).toBeLessThan(plan.levelShare.valley);
  });
});

describe('infeasible windows', () => {
  it('reports how far it can get when there is not enough time', () => {
    const plan = planCharge(
      makeInput({ strategy: 'latest', departAt: plugInAt + 30 * MS_PER_MINUTE }),
    );
    expect(plan.feasible).toBe(false);
    expect(plan.reachableSoc).toBeGreaterThan(35);
    expect(plan.reachableSoc).toBeLessThan(85);

    const warning = plan.warnings.find((w) => w.code === 'window-too-short');
    expect(warning?.severity).toBe('critical');
    expect(warning?.params?.neededMinutes).toBe(223);
  });

  it('returns an empty plan when the target is at or below the current SOC', () => {
    const plan = planCharge(makeInput({ currentSoc: 90, targetSoc: 85 }));
    expect(plan.gridKwh).toBe(0);
    expect(plan.segments).toHaveLength(0);
    expect(plan.warnings.map((w) => w.code)).toContain('target-not-above-current');
  });
});

describe('warnings', () => {
  it('notes when the wallbox is more capable than the car', () => {
    const plan = planCharge(makeInput({ chargerPowerKw: 11 }));
    const warning = plan.warnings.find((w) => w.code === 'charger-exceeds-vehicle');
    expect(warning?.params).toEqual({ chargerKw: 11, vehicleKw: 6.6 });
  });

  it('notes the DC taper when fast-charging past 80%', () => {
    const plan = planCharge(
      makeInput({ currentType: 'dc', chargerPowerKw: 60, targetSoc: 95, efficiency: 0.95 }),
    );
    expect(plan.warnings.map((w) => w.code)).toContain('dc-taper-past-80');
  });

  it('notes when no tariff is configured', () => {
    const plan = planCharge(makeInput({ tariff: null }));
    expect(plan.warnings.map((w) => w.code)).toContain('no-tariff');
    expect(plan.cost.total).toBe(0);
  });

  it('notes the assumed horizon when cost planning without a departure time', () => {
    const plan = planCharge(makeInput({ strategy: 'cheapest', departAt: undefined }));
    expect(plan.warnings.map((w) => w.code)).toContain('no-departure-horizon');
  });
});

describe('plan consistency', () => {
  it('keeps energy, losses and segments in agreement', () => {
    const plan = planCharge(makeInput({ strategy: 'balanced' }));

    expect(plan.batteryKwh).toBeCloseTo(22.56, 2);
    expect(plan.gridKwh).toBeCloseTo(plan.batteryKwh / 0.92, 2);
    expect(plan.lossKwh).toBeCloseTo(plan.gridKwh - plan.batteryKwh, 3);

    const segmentGrid = plan.segments.reduce((sum, s) => sum + s.gridKwh, 0);
    const segmentCost = plan.segments.reduce((sum, s) => sum + s.cost, 0);
    expect(segmentGrid).toBeCloseTo(plan.gridKwh, 2);
    expect(segmentCost).toBeCloseTo(plan.cost.total, 2);

    const shares = Object.values(plan.levelShare).reduce((a, b) => a + b, 0);
    expect(shares).toBeCloseTo(1, 6);
  });

  it('produces a SOC curve that rises from the start to the target', () => {
    const plan = planCharge(makeInput({ strategy: 'balanced' }));
    expect(plan.socCurve.length).toBeGreaterThan(2);
    expect(plan.socCurve[0]?.soc).toBeCloseTo(35, 1);
    expect(plan.socCurve.at(-1)?.soc).toBeCloseTo(85, 1);
    for (let i = 1; i < plan.socCurve.length; i += 1) {
      expect(plan.socCurve[i]!.soc).toBeGreaterThanOrEqual(plan.socCurve[i - 1]!.soc - 1e-6);
      expect(plan.socCurve[i]!.t).toBeGreaterThanOrEqual(plan.socCurve[i - 1]!.t);
    }
  });
});
