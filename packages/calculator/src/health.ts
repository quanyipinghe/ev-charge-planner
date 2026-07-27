import {
  type Advice,
  type BatteryAssessment,
  type ChargeSession,
  type SocRange,
  type UsageMode,
  type Vehicle,
  isLfpFamily,
} from '@evcp/models';
import { roundTo } from './cost';

/** LFP packs drift out of calibration and want a full charge roughly fortnightly. */
export const LFP_CALIBRATION_DAYS = 14;
/** Other chemistries rarely need it; a quarterly balance is plenty. */
export const NMC_CALIBRATION_DAYS = 90;

export interface HealthInput {
  vehicle: Vehicle;
  currentSoc: number;
  targetSoc?: number;
  usageMode: UsageMode;
  /** Days the car will sit unused, for `parking` mode. */
  idleDays?: number;
  daysSinceFullCharge?: number | null;
  /** Time the plan leaves the car parked above the high-SOC threshold. */
  highSocDwellMinutes?: number;
  temperatureC?: number;
  recentSessions?: readonly ChargeSession[];
}

/** Comfortable day-to-day operating window for a chemistry. */
export function dailyRange(vehicle: Vehicle): SocRange {
  return isLfpFamily(vehicle.batteryType) ? { min: 20, max: 90 } : { min: 20, max: 80 };
}

/** SOC to leave the car at when it will not be driven for a while. */
export function storageSoc(vehicle: Vehicle, idleDays = 7): number {
  const base = isLfpFamily(vehicle.batteryType) ? 60 : 55;
  return idleDays > 30 ? base - 5 : base;
}

/** Target SOC that suits how the car is about to be used. */
export function recommendedTargetSoc(
  vehicle: Vehicle,
  mode: UsageMode,
  idleDays?: number,
): number {
  switch (mode) {
    case 'longTrip':
      return 100;
    case 'parking':
      return storageSoc(vehicle, idleDays);
    case 'daily':
    default:
      return dailyRange(vehicle).max;
  }
}

/** Share of recent sessions that used DC fast charging. */
function dcShare(sessions: readonly ChargeSession[] | undefined): number {
  if (!sessions?.length) return 0;
  return sessions.filter((s) => s.currentType === 'dc').length / sessions.length;
}

/**
 * Relative pack-stress indicator (0-100, lower is gentler).
 *
 * It combines the factors that actually drive calendar and cycle ageing — resting at
 * high SOC, how long it rests there, temperature extremes and fast-charge frequency.
 * It is a comparison aid between charging habits, not a degradation forecast.
 */
export function stressScore(input: HealthInput): number {
  const restingSoc = input.targetSoc ?? input.currentSoc;
  const socStress = Math.min(1, Math.max(0, (restingSoc - 80) / 20)) * 35;

  const dwellHours = (input.highSocDwellMinutes ?? 0) / 60;
  const dwellStress = Math.min(1, dwellHours / 24) * 25;

  let tempStress = 0;
  if (input.temperatureC !== undefined) {
    if (input.temperatureC > 35) tempStress = Math.min(1, (input.temperatureC - 35) / 15) * 20;
    else if (input.temperatureC < 0) tempStress = Math.min(1, -input.temperatureC / 20) * 10;
  }

  const dcStress = dcShare(input.recentSessions) * 20;

  return roundTo(Math.min(100, socStress + dwellStress + tempStress + dcStress), 1);
}

/**
 * Turns the current situation into concrete, chemistry-aware battery advice.
 *
 * Advice is emitted as `{ code, severity, params }` rather than prose so the web app,
 * the bots and any future channel all render the same rules through one i18n table.
 */
export function assessBattery(input: HealthInput): BatteryAssessment {
  const { vehicle, currentSoc } = input;
  const lfp = isLfpFamily(vehicle.batteryType);
  const range = dailyRange(vehicle);
  const storage = storageSoc(vehicle, input.idleDays);
  const advices: Advice[] = [];

  if (currentSoc < 10) {
    advices.push({ code: 'soc-critical', severity: 'critical', params: { soc: currentSoc } });
  } else if (currentSoc < 20) {
    advices.push({ code: 'soc-low', severity: 'warn', params: { soc: currentSoc } });
  }

  const target = input.targetSoc;
  if (target !== undefined) {
    if (input.usageMode === 'daily' && target > range.max) {
      advices.push({
        code: 'daily-target-high',
        severity: 'info',
        params: { target, suggested: range.max },
      });
    }
    if (input.usageMode === 'longTrip' && target >= 100) {
      advices.push({ code: 'long-trip-full-ok', severity: 'info' });
    }
    if (input.usageMode === 'parking' && target > storage + 15) {
      advices.push({
        code: 'parking-soc-high',
        severity: 'warn',
        params: { target, recommended: storage },
      });
    }
  }

  if (input.usageMode === 'parking') {
    advices.push({
      code: 'parking-soc',
      severity: 'info',
      params: { recommended: storage, days: input.idleDays ?? 7 },
    });
    if (currentSoc > 90) {
      advices.push({ code: 'storage-full-charge', severity: 'warn', params: { soc: currentSoc } });
    }
  }

  const calibrationInterval = lfp ? LFP_CALIBRATION_DAYS : NMC_CALIBRATION_DAYS;
  const daysSinceFull = input.daysSinceFullCharge ?? null;
  const calibrationDue = lfp && (daysSinceFull === null || daysSinceFull >= calibrationInterval);
  if (lfp) {
    if (daysSinceFull === null) {
      advices.push({
        code: 'lfp-calibration-unknown',
        severity: 'info',
        params: { interval: calibrationInterval },
      });
    } else if (daysSinceFull >= calibrationInterval) {
      advices.push({
        code: 'lfp-calibration-due',
        severity: 'info',
        params: { days: daysSinceFull, interval: calibrationInterval },
      });
    }
  } else if (currentSoc > 90) {
    advices.push({ code: 'nmc-avoid-100', severity: 'warn', params: { soc: currentSoc } });
  }

  const dwellHours = (input.highSocDwellMinutes ?? 0) / 60;
  if (dwellHours >= 8) {
    advices.push({
      code: 'high-soc-dwell',
      severity: 'warn',
      params: { hours: roundTo(dwellHours, 1) },
    });
  }

  if (input.temperatureC !== undefined) {
    if (input.temperatureC < 0) {
      advices.push({
        code: 'cold-charging',
        severity: 'info',
        params: { temperatureC: input.temperatureC },
      });
    } else if (input.temperatureC > 35) {
      advices.push({
        code: 'hot-parking',
        severity: 'info',
        params: { temperatureC: input.temperatureC },
      });
    }
  }

  const share = dcShare(input.recentSessions);
  if (share > 0.6 && (input.recentSessions?.length ?? 0) >= 5) {
    advices.push({
      code: 'dc-heavy',
      severity: 'info',
      params: { share: roundTo(share * 100, 0) },
    });
  }

  return {
    dailyRange: range,
    storageSoc: storage,
    stressScore: stressScore(input),
    calibration: {
      intervalDays: calibrationInterval,
      daysSinceFullCharge: daysSinceFull,
      due: calibrationDue,
    },
    advices,
  };
}

/** Days since the most recent session that ended at (or very near) 100%. */
export function daysSinceFullCharge(
  sessions: readonly ChargeSession[],
  now: number,
): number | null {
  const full = sessions
    .filter((s) => s.fullCharge || s.endSoc >= 99.5)
    .sort((a, b) => b.endAt - a.endAt)[0];
  if (!full) return null;
  return Math.floor((now - full.endAt) / 86_400_000);
}
