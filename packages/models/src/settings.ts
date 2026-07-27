import { z } from 'zod';
import { localeSchema, socSchema, timeZoneSchema } from './common';
import { strategySchema } from './plan';

export const themeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof themeSchema>;

export const notificationSettingsSchema = z.object({
  /** Base URL of a deployed `apps/api`. Empty means "no backend"; ICS export still works. */
  apiBaseUrl: z.string().default(''),
  telegram: z
    .object({
      enabled: z.boolean().default(false),
      botToken: z.string().default(''),
      chatId: z.string().default(''),
    })
    .default({}),
  wecom: z
    .object({
      enabled: z.boolean().default(false),
      webhookUrl: z.string().default(''),
    })
    .default({}),
  /** Remind this many minutes before the planned charging start. */
  leadMinutes: z.number().int().min(0).max(240).default(10),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const appSettingsSchema = z.object({
  locale: localeSchema.default('zh-CN'),
  theme: themeSchema.default('system'),
  timeZone: timeZoneSchema,
  defaultVehicleId: z.string().optional(),
  defaultTariffId: z.string().optional(),
  defaultChargerId: z.string().default('ac-7'),
  defaultStrategy: strategySchema.default('balanced'),
  efficiency: z.number().min(0.5).max(1).default(0.92),
  targetSoc: socSchema.default(85),
  highSocThreshold: socSchema.default(80),
  bufferMinutes: z.number().int().min(0).max(240).default(5),
  /** Household kWh used this month so far, for tiered-pricing lookup. */
  monthlyKwhSoFar: z.number().min(0).default(0),
  /** Stable per-browser identifier used to own server-side reminders. */
  deviceId: z.string().default(''),
  notification: notificationSettingsSchema.default({}),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const defaultSettings = (): AppSettings => appSettingsSchema.parse({});
