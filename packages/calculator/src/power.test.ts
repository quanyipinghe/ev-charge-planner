import { describe, expect, it } from 'vitest';
import {
  AC_TAPER_END_FACTOR,
  AC_TAPER_START_SOC,
  dcTemperatureFactor,
  effectiveEfficiency,
  effectivePowerKw,
  interpolateCurve,
  vehiclePowerCeilingKw,
} from './power';
import { nmcSedan, yuanUp } from './fixtures';

describe('vehiclePowerCeilingKw', () => {
  it('uses the on-board charger limit for AC', () => {
    expect(vehiclePowerCeilingKw(yuanUp, 'ac')).toBe(6.6);
  });

  it('uses the DC peak for DC', () => {
    expect(vehiclePowerCeilingKw(yuanUp, 'dc')).toBe(65);
  });

  it('falls back to the AC limit when the car has no DC inlet', () => {
    expect(vehiclePowerCeilingKw({ ...yuanUp, dcMaxKw: 0 }, 'dc')).toBe(6.6);
  });
});

describe('effectivePowerKw', () => {
  it('clamps a 7kW wallbox to the 6.6kW on-board charger', () => {
    const power = effectivePowerKw({
      soc: 50,
      chargerPowerKw: 7,
      currentType: 'ac',
      vehicle: yuanUp,
    });
    expect(power).toBe(6.6);
  });

  it('clamps to the wallbox when the car could accept more', () => {
    const power = effectivePowerKw({
      soc: 50,
      chargerPowerKw: 3.3,
      currentType: 'ac',
      vehicle: nmcSedan,
    });
    expect(power).toBe(3.3);
  });

  it('holds AC power constant right up to the taper point', () => {
    const before = effectivePowerKw({
      soc: AC_TAPER_START_SOC,
      chargerPowerKw: 7,
      currentType: 'ac',
      vehicle: yuanUp,
    });
    expect(before).toBe(6.6);
  });

  it('tapers AC power down to the documented fraction at 100%', () => {
    const full = effectivePowerKw({
      soc: 100,
      chargerPowerKw: 7,
      currentType: 'ac',
      vehicle: yuanUp,
    });
    expect(full).toBeCloseTo(6.6 * AC_TAPER_END_FACTOR, 6);
  });

  it('keeps LFP at full DC power longer than NMC, then drops it faster', () => {
    const lfpAt50 = effectivePowerKw({ soc: 50, chargerPowerKw: 999, currentType: 'dc', vehicle: yuanUp });
    const nmcAt50 = effectivePowerKw({ soc: 50, chargerPowerKw: 999, currentType: 'dc', vehicle: nmcSedan });
    expect(lfpAt50 / 65).toBeGreaterThan(nmcAt50 / 180);

    const lfpAt95 = effectivePowerKw({ soc: 95, chargerPowerKw: 999, currentType: 'dc', vehicle: yuanUp });
    expect(lfpAt95 / 65).toBeLessThan(0.2);
  });

  it('honours a vehicle-specific DC curve over the chemistry default', () => {
    const custom = { ...yuanUp, dcCurve: [[0, 0.5], [100, 0.5]] as [number, number][] };
    const power = effectivePowerKw({ soc: 20, chargerPowerKw: 999, currentType: 'dc', vehicle: custom });
    expect(power).toBeCloseTo(65 * 0.5, 6);
  });

  it('derates DC power in the cold but leaves AC power alone', () => {
    const coldDc = effectivePowerKw({
      soc: 20,
      chargerPowerKw: 120,
      currentType: 'dc',
      vehicle: nmcSedan,
      temperatureC: -10,
    });
    const warmDc = effectivePowerKw({
      soc: 20,
      chargerPowerKw: 120,
      currentType: 'dc',
      vehicle: nmcSedan,
      temperatureC: 25,
    });
    expect(coldDc).toBeLessThan(warmDc * 0.5);

    const coldAc = effectivePowerKw({
      soc: 20,
      chargerPowerKw: 7,
      currentType: 'ac',
      vehicle: yuanUp,
      temperatureC: -10,
    });
    expect(coldAc).toBe(6.6);
  });
});

describe('temperature helpers', () => {
  it('leaves values untouched when no temperature is supplied', () => {
    expect(dcTemperatureFactor(undefined)).toBe(1);
    expect(effectiveEfficiency(0.92, undefined)).toBeCloseTo(0.92, 6);
  });

  it('lowers effective efficiency in the cold', () => {
    expect(effectiveEfficiency(0.92, -10)).toBeLessThan(0.92);
  });

  it('never reports an efficiency outside a physical range', () => {
    expect(effectiveEfficiency(0.99, 25)).toBeLessThanOrEqual(0.995);
    expect(effectiveEfficiency(0.5, -20)).toBeGreaterThanOrEqual(0.5);
  });
});

describe('interpolateCurve', () => {
  it('clamps outside the defined range', () => {
    const curve: [number, number][] = [
      [20, 0.4],
      [80, 1],
    ];
    expect(interpolateCurve(curve, 0)).toBe(0.4);
    expect(interpolateCurve(curve, 100)).toBe(1);
  });

  it('interpolates linearly between points', () => {
    const curve: [number, number][] = [
      [0, 0],
      [100, 1],
    ];
    expect(interpolateCurve(curve, 25)).toBeCloseTo(0.25, 6);
  });
});
