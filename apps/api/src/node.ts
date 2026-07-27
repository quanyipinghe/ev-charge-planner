import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { serve } from '@hono/node-server';
import cron from 'node-cron';
import { createApp } from './app';
import { dispatchDueReminders } from './dispatcher';
import { SqliteReminderStore } from './storage/sqlite';

const port = Number(process.env.PORT ?? 8787);
const databaseFile = process.env.DATABASE_FILE ?? './data/evcp.sqlite';
const encryptionKey = process.env.ENCRYPTION_KEY;

if (!encryptionKey) {
  console.error(
    'ENCRYPTION_KEY is required. Generate one with:\n  node -e "console.log(crypto.randomUUID())"',
  );
  process.exit(1);
}

mkdirSync(dirname(databaseFile), { recursive: true });
const store = new SqliteReminderStore(databaseFile);
await store.init();

const app = createApp({
  store,
  encryptionKey,
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? '*',
  maxPendingPerDevice: Number(process.env.MAX_PENDING_PER_DEVICE ?? 20),
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  defaultVehicleId: process.env.DEFAULT_VEHICLE_ID,
  defaultTariffId: process.env.DEFAULT_TARIFF_ID,
});

// The Workers deployment uses a cron trigger for this; on a server we schedule it
// in-process so a single container is all that is needed.
const schedule = process.env.DISPATCH_CRON ?? '*/5 * * * *';
cron.schedule(schedule, () => {
  dispatchDueReminders(store, encryptionKey)
    .then((summary) => {
      if (summary.processed > 0) console.log('dispatch', JSON.stringify(summary));
    })
    .catch((error: unknown) => console.error('dispatch failed', error));
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`EVChargePlanner API listening on http://localhost:${info.port}`);
  console.log(`  database: ${databaseFile}`);
  console.log(`  dispatch schedule: ${schedule}`);
});
