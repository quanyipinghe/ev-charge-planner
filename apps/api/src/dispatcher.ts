import { type Locale } from '@evcp/models';
import { type NotificationMessage, type NotificationTarget, dispatch } from '@evcp/notification';
import { decryptJson } from './crypto';
import type { ReminderStore } from './storage/types';

export interface ReminderPayload {
  message: NotificationMessage;
  targets: NotificationTarget[];
  locale: Locale;
}

export interface DispatchSummary {
  processed: number;
  sent: number;
  failed: number;
}

/** Finished reminders are kept this long for troubleshooting, then swept. */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Sends every reminder that has come due.
 *
 * Shared by both runtimes: a Cloudflare cron trigger and a `node-cron` schedule call
 * exactly this function, so delivery behaviour cannot drift between deployments.
 */
export async function dispatchDueReminders(
  store: ReminderStore,
  encryptionKey: string,
  now: number = Date.now(),
  limit = 50,
): Promise<DispatchSummary> {
  const due = await store.due(now, limit);
  let sent = 0;
  let failed = 0;

  for (const reminder of due) {
    try {
      const payload = await decryptJson<ReminderPayload>(reminder.payload, encryptionKey);
      const results = await dispatch(payload.targets, payload.message);
      const errors = results.filter((result) => !result.ok);

      if (errors.length === 0) {
        await store.markSent(reminder.id);
        sent += 1;
      } else {
        await store.markFailed(
          reminder.id,
          errors.map((error) => `${error.channel}: ${error.error}`).join('; '),
          reminder.attempts + 1,
        );
        failed += 1;
      }
    } catch (error) {
      // A payload that cannot be decrypted will never succeed, so burn the retries.
      await store.markFailed(reminder.id, (error as Error).message, 3);
      failed += 1;
    }
  }

  await store.purgeBefore(now - RETENTION_MS);
  return { processed: due.length, sent, failed };
}
