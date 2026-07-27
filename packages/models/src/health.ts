import type { Warning } from './plan';

/** Health advice reuses the warning shape so the UI renders both through one i18n path. */
export type Advice = Warning;

export interface SocRange {
  min: number;
  max: number;
}

export interface CalibrationStatus {
  /** Recommended interval between full charges, in days. Only meaningful for LFP. */
  intervalDays: number;
  daysSinceFullCharge: number | null;
  due: boolean;
}

export interface BatteryAssessment {
  /** Suggested day-to-day operating window for this chemistry and usage. */
  dailyRange: SocRange;
  /** Suggested SOC when the car will sit unused. */
  storageSoc: number;
  /**
   * 0-100 stress indicator combining high-SOC exposure, cycle depth and temperature.
   * Lower is gentler on the pack; it is a relative signal, not a degradation forecast.
   */
  stressScore: number;
  calibration: CalibrationStatus;
  advices: Advice[];
}

/** How the car will be used next — changes the recommended target SOC. */
export type UsageMode = 'daily' | 'longTrip' | 'parking';
