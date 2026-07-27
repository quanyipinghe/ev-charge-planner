/**
 * Every advisory code the engine can emit. Listing them here makes each locale
 * dictionary provably complete: a new code fails to compile until it is translated.
 */
export const WARNING_CODES = [
  'charger-exceeds-vehicle',
  'window-too-short',
  'split-schedule',
  'high-soc-dwell',
  'no-tariff',
  'no-departure-horizon',
  'latest-needs-departure',
  'target-not-above-current',
  'cold-charging',
  'dc-taper-past-80',
] as const;

export type WarningCode = (typeof WARNING_CODES)[number];

export const ADVICE_CODES = [
  'soc-critical',
  'soc-low',
  'daily-target-high',
  'long-trip-full-ok',
  'parking-soc',
  'parking-soc-high',
  'storage-full-charge',
  'lfp-calibration-due',
  'lfp-calibration-unknown',
  'nmc-avoid-100',
  'high-soc-dwell',
  'cold-charging',
  'hot-parking',
  'dc-heavy',
] as const;

export type AdviceCode = (typeof ADVICE_CODES)[number];

export type Params = Record<string, string | number>;
export type Template = (params: Params) => string;
