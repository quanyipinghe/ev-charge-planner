import { describe, expect, it } from 'vitest';
import {
  availableEnergyKwh,
  estimateRangeKm,
  rangeTemperatureFactor,
  requiredSocForTrip,
  tripNeedsStop,
} from './range';
import { nmcSedan, yuanUp } from './fixtures';

describe('rangeTemperatureFactor', () => {
  it('is neutral when no temperature is known', () => {
    expect(rangeTemperatureFactor(undefined)).toBe(1);
  });

  it('cuts range sharply in freezing weather', () => {
    expect(rangeTemperatureFactor(-10)).toBeLessThan(0.7);
    expect(rangeTemperatureFactor(25)).toBe(1);
  });

  it('penalises LFP a little more in the cold', () => {
    expect(rangeTemperatureFactor(-10, yuanUp)).toBeLessThan(rangeTemperatureFactor(-10, nmcSedan));
    // Above the cold threshold the two are treated the same.
    expect(rangeTemperatureFactor(25, yuanUp)).toBe(rangeTemperatureFactor(25, nmcSedan));
  });
});

describe('estimateRangeKm', () => {
  it('scales with the energy actually available', () => {
    expect(availableEnergyKwh({ vehicle: yuanUp, soc: 50 })).toBeCloseTo(22.56, 4);
    expect(availableEnergyKwh({ vehicle: yuanUp, soc: 50, reserveSoc: 10 })).toBeCloseTo(18.048, 4);
  });

  it('reports roughly the rated range on a full charge in mild weather', () => {
    const km = estimateRangeKm({ vehicle: yuanUp, soc: 100, temperatureC: 25 });
    // 45.12 kWh at 11.2 kWh/100km.
    expect(km).toBeCloseTo(402.9, 0);
  });

  it('reports much less in winter', () => {
    const mild = estimateRangeKm({ vehicle: yuanUp, soc: 100, temperatureC: 25 });
    const winter = estimateRangeKm({ vehicle: yuanUp, soc: 100, temperatureC: -10 });
    expect(winter).toBeLessThan(mild * 0.7);
  });

  it('accounts for climate control', () => {
    const off = estimateRangeKm({ vehicle: yuanUp, soc: 80, temperatureC: 20 });
    const on = estimateRangeKm({ vehicle: yuanUp, soc: 80, temperatureC: 20, hvacOn: true });
    expect(on).toBeLessThan(off);
  });

  it('is zero at an empty battery', () => {
    expect(estimateRangeKm({ vehicle: yuanUp, soc: 0 })).toBe(0);
  });
});

describe('requiredSocForTrip', () => {
  it('turns a distance into a target SOC with reserve on top', () => {
    // 180 km at 11.2 kWh/100km = 20.16 kWh = 44.7% of the pack, plus 15% reserve.
    const soc = requiredSocForTrip({
      vehicle: yuanUp,
      distanceKm: 180,
      temperatureC: 25,
      reserveSoc: 15,
    });
    expect(soc).toBeCloseTo(59.7, 0);
  });

  it('doubles the distance for a round trip', () => {
    const oneWay = requiredSocForTrip({ vehicle: yuanUp, distanceKm: 100, temperatureC: 25, reserveSoc: 0 });
    const roundTrip = requiredSocForTrip({
      vehicle: yuanUp,
      distanceKm: 100,
      roundTrip: true,
      temperatureC: 25,
      reserveSoc: 0,
    });
    expect(roundTrip).toBeCloseTo(oneWay * 2, 1);
  });

  it('asks for more charge when it is cold', () => {
    const mild = requiredSocForTrip({ vehicle: yuanUp, distanceKm: 200, temperatureC: 25 });
    const cold = requiredSocForTrip({ vehicle: yuanUp, distanceKm: 200, temperatureC: -10 });
    expect(cold).toBeGreaterThan(mild);
  });

  it('caps at 100% and flags trips that need a charging stop', () => {
    const input = { vehicle: yuanUp, distanceKm: 600, temperatureC: 25 };
    expect(requiredSocForTrip(input)).toBe(100);
    expect(tripNeedsStop(input)).toBe(true);
    expect(tripNeedsStop({ vehicle: yuanUp, distanceKm: 100, temperatureC: 25 })).toBe(false);
  });
});
