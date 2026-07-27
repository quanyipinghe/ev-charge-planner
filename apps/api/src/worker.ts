import { createApp } from './app';
import { dispatchDueReminders } from './dispatcher';
import { D1ReminderStore, type D1Like } from './storage/d1';

export interface Env {
  DB: D1Like;
  ENCRYPTION_KEY: string;
  ALLOWED_ORIGINS?: string;
  MAX_PENDING_PER_DEVICE?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  DEFAULT_VEHICLE_ID?: string;
  DEFAULT_TARIFF_ID?: string;
}

function configure(env: Env) {
  if (!env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is not configured — set it with `wrangler secret put`');
  }
  return {
    store: new D1ReminderStore(env.DB),
    encryptionKey: env.ENCRYPTION_KEY,
    allowedOrigins: env.ALLOWED_ORIGINS ?? '*',
    maxPendingPerDevice: Number(env.MAX_PENDING_PER_DEVICE ?? 20),
    telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    defaultVehicleId: env.DEFAULT_VEHICLE_ID,
    defaultTariffId: env.DEFAULT_TARIFF_ID,
  };
}

/**
 * Cloudflare Workers entry point.
 *
 * `scheduled` is wired to a cron trigger in wrangler.toml and calls the same
 * dispatcher the Node deployment runs on a local schedule.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return createApp(configure(env)).fetch(request, env, ctx);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const config = configure(env);
    ctx.waitUntil(
      (async () => {
        await config.store.init();
        const summary = await dispatchDueReminders(config.store, config.encryptionKey);
        console.log('dispatch', JSON.stringify(summary));
      })(),
    );
  },
};
