import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import {
  localeSchema,
  planInputSchema,
  vehicleDisplayName,
} from '@evcp/models';
import { planCharge } from '@evcp/calculator';
import {
  type NotificationTarget,
  dispatch,
  notificationMessageSchema,
  notificationTargetSchema,
  reminderKindSchema,
  renderPlanMessages,
} from '@evcp/notification';
import { TARIFFS, VEHICLES } from './catalog';
import { encryptJson } from './crypto';
import { dispatchDueReminders } from './dispatcher';
import type { ReminderStore, StoredReminder } from './storage/types';

export interface AppConfig {
  store: ReminderStore;
  /** Key used to encrypt stored channel credentials. */
  encryptionKey: string;
  /** Comma-separated origins, or `*`. */
  allowedOrigins: string;
  /** Cap on pending reminders per device, to keep a public instance from filling up. */
  maxPendingPerDevice: number;
  /** Optional shared secret for the Telegram webhook. */
  telegramWebhookSecret?: string;
  defaultVehicleId?: string;
  defaultTariffId?: string;
}

/**
 * Hosts that outbound webhooks may target.
 *
 * `/api/notify` forwards a user-supplied URL, which without this check would turn a
 * public instance into an open relay into private networks. Telegram is not listed
 * because its endpoint is built from a token, never from user input.
 */
const WEBHOOK_HOST_ALLOWLIST = ['qyapi.weixin.qq.com'];

function targetIsAllowed(target: NotificationTarget): boolean {
  if (target.type !== 'wecom') return true;
  try {
    return WEBHOOK_HOST_ALLOWLIST.includes(new URL(target.webhookUrl).hostname);
  } catch {
    return false;
  }
}

const scheduleRequestSchema = z.object({
  deviceId: z.string().min(8).max(64),
  kind: reminderKindSchema,
  fireAt: z.number().int(),
  message: notificationMessageSchema,
  targets: z.array(notificationTargetSchema).min(1).max(4),
  locale: localeSchema.default('zh-CN'),
});

const notifyRequestSchema = z.object({
  targets: z.array(notificationTargetSchema).min(1).max(4),
  message: notificationMessageSchema,
});

/** Reminders further out than this are almost certainly a mistake. */
const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;

export function createApp(config: AppConfig) {
  const app = new Hono();

  app.use(
    '/api/*',
    cors({
      origin: config.allowedOrigins === '*' ? '*' : config.allowedOrigins.split(',').map((o) => o.trim()),
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['content-type'],
      maxAge: 86_400,
    }),
  );

  app.get('/api/health', (c) => c.json({ ok: true, vehicles: VEHICLES.length, tariffs: TARIFFS.length }));

  app.get('/api/vehicles', (c) => c.json({ vehicles: VEHICLES }));
  app.get('/api/tariffs', (c) => c.json({ tariffs: TARIFFS }));

  // Server-side planning, so bots and third-party integrations get exactly the same
  // numbers as the web app rather than a reimplementation.
  app.post('/api/plan', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = planInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid plan input', issues: parsed.error.issues }, 400);
    }
    return c.json({ plan: planCharge(parsed.data) });
  });

  app.post('/api/notify', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = notifyRequestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid notify request' }, 400);

    if (!parsed.data.targets.every(targetIsAllowed)) {
      return c.json({ error: 'webhook host not allowed' }, 400);
    }

    const results = await dispatch(parsed.data.targets, parsed.data.message);
    return c.json({ results });
  });

  app.post('/api/reminders', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = scheduleRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid reminder', issues: parsed.error.issues }, 400);
    }

    const { deviceId, kind, fireAt, message, targets, locale } = parsed.data;
    if (!targets.every(targetIsAllowed)) {
      return c.json({ error: 'webhook host not allowed' }, 400);
    }

    const now = Date.now();
    if (fireAt > now + MAX_SCHEDULE_AHEAD_MS) {
      return c.json({ error: 'fireAt is too far in the future' }, 400);
    }
    if ((await config.store.countPending(deviceId)) >= config.maxPendingPerDevice) {
      return c.json({ error: 'too many pending reminders for this device' }, 429);
    }

    const reminder: StoredReminder = {
      id: crypto.randomUUID(),
      deviceId,
      kind,
      fireAt,
      payload: await encryptJson({ message, targets, locale }, config.encryptionKey),
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: now,
    };
    await config.store.insert(reminder);
    return c.json({ id: reminder.id, fireAt }, 201);
  });

  app.get('/api/reminders', async (c) => {
    const deviceId = c.req.query('deviceId');
    if (!deviceId) return c.json({ error: 'deviceId is required' }, 400);

    const reminders = await config.store.listByDevice(deviceId, 50);
    // The encrypted payload never leaves the server.
    return c.json({
      reminders: reminders.map(({ payload: _payload, ...rest }) => rest),
    });
  });

  app.delete('/api/reminders/:id', async (c) => {
    const deviceId = c.req.query('deviceId');
    if (!deviceId) return c.json({ error: 'deviceId is required' }, 400);

    const cancelled = await config.store.cancel(c.req.param('id'), deviceId);
    return cancelled ? c.json({ ok: true }) : c.json({ error: 'not found' }, 404);
  });

  app.post('/api/telegram/webhook', async (c) => {
    if (
      config.telegramWebhookSecret &&
      c.req.header('x-telegram-bot-api-secret-token') !== config.telegramWebhookSecret
    ) {
      return c.json({ error: 'forbidden' }, 403);
    }

    const update = (await c.req.json().catch(() => null)) as {
      message?: { text?: string; chat?: { id?: number } };
    } | null;
    const text = update?.message?.text?.trim();
    if (!text?.startsWith('/plan')) return c.json({ ok: true });

    return c.json({
      method: 'sendMessage',
      chat_id: update?.message?.chat?.id,
      text: handlePlanCommand(text, config),
      parse_mode: 'HTML',
    });
  });

  // Lets an external scheduler drive dispatch on hosts without a built-in cron.
  app.post('/api/cron/dispatch', async (c) => {
    const summary = await dispatchDueReminders(config.store, config.encryptionKey);
    return c.json(summary);
  });

  app.notFound((c) => c.json({ error: 'not found' }, 404));
  app.onError((error, c) => c.json({ error: error.message }, 500));

  return app;
}

/** `/plan 35 85` — a quick charging estimate without opening the web app. */
function handlePlanCommand(text: string, config: AppConfig): string {
  const [, currentRaw, targetRaw, vehicleRaw] = text.split(/\s+/);
  const currentSoc = Number(currentRaw);
  const targetSoc = Number(targetRaw ?? 85);

  if (!Number.isFinite(currentSoc)) {
    return 'Usage: /plan &lt;currentSoc&gt; [targetSoc] [vehicleId]\nExample: /plan 35 85';
  }

  const vehicle =
    VEHICLES.find((item) => item.id === (vehicleRaw ?? config.defaultVehicleId)) ?? VEHICLES[0];
  if (!vehicle) return 'No vehicles in the database.';

  const tariff = TARIFFS.find((item) => item.id === config.defaultTariffId) ?? null;
  const parsed = planInputSchema.safeParse({
    vehicle,
    chargerPowerKw: 7,
    currentSoc,
    targetSoc: Number.isFinite(targetSoc) ? targetSoc : 85,
    tariff,
    strategy: 'asap',
    plugInAt: Date.now(),
    timeZone: 'Asia/Shanghai',
  });
  if (!parsed.success) return 'Could not build a plan from those numbers.';

  const plan = planCharge(parsed.data);
  const { start } = renderPlanMessages(plan, {
    locale: 'zh-CN',
    timeZone: parsed.data.timeZone,
    vehicleName: vehicleDisplayName(vehicle, 'zh-CN'),
  });
  return `<b>${start.title}</b>\n${start.body.replace(/\*\*/g, '')}`;
}
