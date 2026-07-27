import { describe, expect, it } from 'vitest';
import type { ChargeSession } from '@evcp/models';
import {
  LFP_CALIBRATION_DAYS,
  assessBattery,
  dailyRange,
  daysSinceFullCharge,
  recommendedTargetSoc,
  storageSoc,
  stressScore,
} from './health';
import { nmcSedan, yuanUp } from './fixtures';

const codes = (result: { advices: { code: string }[] }) => result.advices.map((a) => a.code);

describe('chemistry-specific ranges', () => {
  it('gives LFP a wider daily window than NMC', () => {
    expect(dailyRange(yuanUp).max).toBe(90);
    expect(dailyRange(nmcSedan).max).toBe(80);
  });

  it('recommends a mid-pack SOC for storage', () => {
    expect(storageSoc(yuanUp)).toBe(60);
    expect(storageSoc(nmcSedan)).toBe(55);
    expect(storageSoc(yuanUp, 60)).toBe(55);
  });

  it('recommends a full charge only for a long trip', () => {
    expect(recommendedTargetSoc(yuanUp, 'daily')).toBe(90);
    expect(recommendedTargetSoc(yuanUp, 'longTrip')).toBe(100);
    expect(recommendedTargetSoc(yuanUp, 'parking', 7)).toBe(60);
  });
});

describe('assessBattery', () => {
  it('flags a low battery and escalates when it is critical', () => {
    expect(codes(assessBattery({ vehicle: yuanUp, currentSoc: 15, usageMode: 'daily' }))).toContain(
      'soc-low',
    );

    const critical = assessBattery({ vehicle: yuanUp, currentSoc: 5, usageMode: 'daily' });
    expect(codes(critical)).toContain('soc-critical');
    expect(critical.advices.find((a) => a.code === 'soc-critical')?.severity).toBe('critical');
  });

  it('suggests a lower daily target when the user aims too high', () => {
    const result = assessBattery({
      vehicle: nmcSedan,
      currentSoc: 40,
      targetSoc: 95,
      usageMode: 'daily',
    });
    const advice = result.advices.find((a) => a.code === 'daily-target-high');
    expect(advice?.params).toEqual({ target: 95, suggested: 80 });
  });

  it('accepts a full charge before a long trip', () => {
    const result = assessBattery({
      vehicle: nmcSedan,
      currentSoc: 40,
      targetSoc: 100,
      usageMode: 'longTrip',
    });
    expect(codes(result)).toContain('long-trip-full-ok');
    expect(codes(result)).not.toContain('daily-target-high');
  });

  it('warns about leaving a car parked at high SOC', () => {
    const result = assessBattery({
      vehicle: nmcSedan,
      currentSoc: 95,
      targetSoc: 95,
      usageMode: 'parking',
      idleDays: 7,
    });
    expect(codes(result)).toContain('storage-full-charge');
    expect(codes(result)).toContain('parking-soc-high');
    expect(result.storageSoc).toBe(55);
  });

  it('asks LFP owners to recalibrate when a full charge is overdue', () => {
    const due = assessBattery({
      vehicle: yuanUp,
      currentSoc: 50,
      usageMode: 'daily',
      daysSinceFullCharge: LFP_CALIBRATION_DAYS + 3,
    });
    expect(codes(due)).toContain('lfp-calibration-due');
    expect(due.calibration.due).toBe(true);

    const recent = assessBattery({
      vehicle: yuanUp,
      currentSoc: 50,
      usageMode: 'daily',
      daysSinceFullCharge: 2,
    });
    expect(codes(recent)).not.toContain('lfp-calibration-due');
    expect(recent.calibration.due).toBe(false);
  });

  it('does not ask NMC owners to recalibrate, but does warn about sitting near full', () => {
    const result = assessBattery({ vehicle: nmcSedan, currentSoc: 95, usageMode: 'daily' });
    expect(codes(result)).not.toContain('lfp-calibration-due');
    expect(codes(result)).toContain('nmc-avoid-100');
    expect(result.calibration.due).toBe(false);
  });

  it('warns about a long stretch parked above the high-SOC threshold', () => {
    const result = assessBattery({
      vehicle: yuanUp,
      currentSoc: 85,
      usageMode: 'daily',
      highSocDwellMinutes: 10 * 60,
    });
    expect(codes(result)).toContain('high-soc-dwell');
  });

  it('mentions the weather at both extremes', () => {
    expect(codes(assessBattery({ vehicle: yuanUp, currentSoc: 50, usageMode: 'daily', temperatureC: -8 }))).toContain('cold-charging');
    expect(codes(assessBattery({ vehicle: yuanUp, currentSoc: 50, usageMode: 'daily', temperatureC: 40 }))).toContain('hot-parking');
  });

  it('notes a habit of leaning on DC fast charging', () => {
    const sessions = Array.from({ length: 6 }, (_, i) => ({
      currentType: i < 5 ? 'dc' : 'ac',
    })) as ChargeSession[];
    const result = assessBattery({
      vehicle: yuanUp,
      currentSoc: 50,
      usageMode: 'daily',
      recentSessions: sessions,
    });
    expect(codes(result)).toContain('dc-heavy');
  });
});

describe('stressScore', () => {
  it('is low for a gentle daily routine', () => {
    expect(stressScore({ vehicle: yuanUp, currentSoc: 60, targetSoc: 70, usageMode: 'daily' })).toBe(0);
  });

  it('rises with target SOC and time spent there', () => {
    const mild = stressScore({ vehicle: yuanUp, currentSoc: 50, targetSoc: 85, usageMode: 'daily' });
    const harsh = stressScore({
      vehicle: yuanUp,
      currentSoc: 50,
      targetSoc: 100,
      usageMode: 'daily',
      highSocDwellMinutes: 24 * 60,
      temperatureC: 42,
    });
    expect(harsh).toBeGreaterThan(mild);
    expect(harsh).toBeLessThanOrEqual(100);
  });
});

describe('daysSinceFullCharge', () => {
  const now = Date.UTC(2026, 6, 27);

  it('returns null when nothing has ever reached full', () => {
    const sessions = [{ endSoc: 85, fullCharge: false, endAt: now - 86_400_000 }] as ChargeSession[];
    expect(daysSinceFullCharge(sessions, now)).toBeNull();
  });

  it('measures from the most recent full charge', () => {
    const sessions = [
      { endSoc: 100, fullCharge: true, endAt: now - 10 * 86_400_000 },
      { endSoc: 100, fullCharge: true, endAt: now - 3 * 86_400_000 },
    ] as ChargeSession[];
    expect(daysSinceFullCharge(sessions, now)).toBe(3);
  });
});
