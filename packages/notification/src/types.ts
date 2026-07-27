import { z } from 'zod';
import { instantSchema, localeSchema } from '@evcp/models';

/**
 * Channel credentials. These are supplied by the user and, when a reminder is
 * scheduled server-side, stored encrypted at rest — see `apps/api/src/crypto.ts`.
 */
export const telegramTargetSchema = z.object({
  type: z.literal('telegram'),
  botToken: z.string().min(10),
  chatId: z.string().min(1),
});

export const wecomTargetSchema = z.object({
  type: z.literal('wecom'),
  webhookUrl: z.string().url(),
});

export const notificationTargetSchema = z.discriminatedUnion('type', [
  telegramTargetSchema,
  wecomTargetSchema,
]);
export type NotificationTarget = z.infer<typeof notificationTargetSchema>;
export type NotificationChannelType = NotificationTarget['type'];

/** Rendered, channel-agnostic message. Rendering happens before dispatch. */
export const notificationMessageSchema = z.object({
  title: z.string().min(1).max(200),
  /** Body in a small Markdown subset: `**bold**`, `- ` bullets, blank-line paragraphs. */
  body: z.string().min(1).max(4000),
  url: z.string().url().optional(),
});
export type NotificationMessage = z.infer<typeof notificationMessageSchema>;

export const reminderKindSchema = z.enum([
  'chargeStart',
  'chargeComplete',
  'lowSoc',
  'highSocParked',
  'calibrationDue',
  'dailyDigest',
]);
export type ReminderKind = z.infer<typeof reminderKindSchema>;

export const reminderSchema = z.object({
  id: z.string().min(1),
  /** Locally generated device identifier; acts as the owner token (no accounts). */
  deviceId: z.string().min(8).max(64),
  kind: reminderKindSchema,
  fireAt: instantSchema,
  message: notificationMessageSchema,
  targets: z.array(notificationTargetSchema).min(1),
  locale: localeSchema.default('zh-CN'),
  status: z.enum(['pending', 'sent', 'failed', 'cancelled']).default('pending'),
  attempts: z.number().int().min(0).default(0),
  lastError: z.string().optional(),
  createdAt: instantSchema,
});
export type Reminder = z.infer<typeof reminderSchema>;

export interface DeliveryResult {
  channel: NotificationChannelType;
  ok: boolean;
  error?: string;
}

/**
 * A dispatch adapter. Implementations must use `fetch` only, so the same code runs
 * on Cloudflare Workers and Node without a compatibility shim.
 */
export interface NotificationChannel<T extends NotificationTarget = NotificationTarget> {
  readonly type: T['type'];
  send(target: T, message: NotificationMessage): Promise<DeliveryResult>;
}
