import type { Tariff, Vehicle } from '@evcp/models';

/**
 * Test fixtures. Kept out of the package entry point on purpose — production code
 * loads the real records from `data/`.
 */

/** The car from the requirements document: 45.12 kWh LFP, 6.6 kW on-board charger. */
export const yuanUp: Vehicle = {
  id: 'byd-yuan-up-401',
  brand: 'BYD',
  brandZh: '比亚迪',
  model: 'Yuan UP',
  modelZh: '元UP',
  variant: '401km',
  batteryCapacityKwh: 45.12,
  batteryType: 'LFP',
  acMaxKw: 6.6,
  dcMaxKw: 65,
  cltcRangeKm: 401,
  consumptionKwhPer100km: 11.2,
  verified: false,
};

/** A larger NMC car, for contrasting chemistry-dependent behaviour. */
export const nmcSedan: Vehicle = {
  id: 'test-nmc-sedan',
  brand: 'Test',
  model: 'NMC Sedan',
  batteryCapacityKwh: 80,
  batteryType: 'NMC',
  acMaxKw: 11,
  dcMaxKw: 180,
  consumptionKwhPer100km: 15,
  verified: false,
};

/** Valley 23:00-07:00, flat 07:00-17:00, peak 17:00-23:00. */
export const touTariff: Tariff = {
  id: 'test-tou',
  name: 'Test TOU',
  region: { country: 'CN', province: 'Test' },
  currency: 'CNY',
  seasons: [
    {
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      windows: [
        { level: 'valley', from: '23:00', to: '07:00', price: 0.3 },
        { level: 'flat', from: '07:00', to: '17:00', price: 0.6 },
        { level: 'peak', from: '17:00', to: '23:00', price: 0.9 },
      ],
    },
  ],
  verified: false,
};

/** Same schedule plus a two-step tiered surcharge. */
export const tieredTariff: Tariff = {
  ...touTariff,
  id: 'test-tou-tiered',
  tiers: [
    { upToKwh: 100, delta: 0 },
    { upToKwh: 200, delta: 0.05 },
    { upToKwh: null, delta: 0.3 },
  ],
};

export const TZ = 'Asia/Shanghai';

/** Builds an instant from a local Asia/Shanghai wall-clock time (UTC+8, no DST). */
export function shanghai(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): number {
  return Date.UTC(year, month - 1, day, hour - 8, minute);
}
