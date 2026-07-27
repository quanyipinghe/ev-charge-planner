import {
  CREATE_INDEX_SQL,
  CREATE_TABLE_SQL,
  type ReminderRow,
  type ReminderStore,
  type StoredReminder,
  rowToReminder,
} from './types';

/** The slice of the D1 API this store uses — kept local so Workers types stay optional. */
export interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<{ meta?: { changes?: number } }>;
      all<T = unknown>(): Promise<{ results?: T[] }>;
      first<T = unknown>(): Promise<T | null>;
    };
    run(): Promise<unknown>;
  };
  exec?(query: string): Promise<unknown>;
}

/** Cloudflare D1 store, used by the Workers deployment. */
export class D1ReminderStore implements ReminderStore {
  constructor(private readonly db: D1Like) {}

  async init(): Promise<void> {
    // D1 applies schema through migrations in production; this keeps `wrangler dev`
    // and a fresh database usable without a manual step.
    await this.db.prepare(CREATE_TABLE_SQL).run();
    for (const sql of CREATE_INDEX_SQL) await this.db.prepare(sql).run();
  }

  async insert(reminder: StoredReminder): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO reminders (id, device_id, kind, fire_at, payload, status, attempts, last_error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        reminder.id,
        reminder.deviceId,
        reminder.kind,
        reminder.fireAt,
        reminder.payload,
        reminder.status,
        reminder.attempts,
        reminder.lastError,
        reminder.createdAt,
      )
      .run();
  }

  async listByDevice(deviceId: string, limit: number): Promise<StoredReminder[]> {
    const result = await this.db
      .prepare(`SELECT * FROM reminders WHERE device_id = ? ORDER BY fire_at DESC LIMIT ?`)
      .bind(deviceId, limit)
      .all<ReminderRow>();
    return (result.results ?? []).map(rowToReminder);
  }

  async countPending(deviceId: string): Promise<number> {
    const row = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM reminders WHERE device_id = ? AND status = 'pending'`)
      .bind(deviceId)
      .first<{ n: number }>();
    return Number(row?.n ?? 0);
  }

  async due(now: number, limit: number): Promise<StoredReminder[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM reminders WHERE status = 'pending' AND fire_at <= ? ORDER BY fire_at ASC LIMIT ?`,
      )
      .bind(now, limit)
      .all<ReminderRow>();
    return (result.results ?? []).map(rowToReminder);
  }

  async markSent(id: string): Promise<void> {
    await this.db.prepare(`UPDATE reminders SET status = 'sent' WHERE id = ?`).bind(id).run();
  }

  async markFailed(id: string, error: string, attempts: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE reminders SET status = CASE WHEN ? >= 3 THEN 'failed' ELSE 'pending' END,
           attempts = ?, last_error = ? WHERE id = ?`,
      )
      .bind(attempts, attempts, error, id)
      .run();
  }

  async cancel(id: string, deviceId: string): Promise<boolean> {
    const result = await this.db
      .prepare(`UPDATE reminders SET status = 'cancelled' WHERE id = ? AND device_id = ?`)
      .bind(id, deviceId)
      .run();
    return Number(result.meta?.changes ?? 0) > 0;
  }

  async purgeBefore(instant: number): Promise<number> {
    const result = await this.db
      .prepare(`DELETE FROM reminders WHERE status != 'pending' AND fire_at < ?`)
      .bind(instant)
      .run();
    return Number(result.meta?.changes ?? 0);
  }
}
