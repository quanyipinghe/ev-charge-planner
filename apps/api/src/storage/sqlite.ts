import { createRequire } from 'node:module';
// Type-only, so `verbatimModuleSyntax` erases it and no runtime import is emitted.
import type { DatabaseSync as DatabaseSyncClass } from 'node:sqlite';
import {
  CREATE_INDEX_SQL,
  CREATE_TABLE_SQL,
  type ReminderRow,
  type ReminderStore,
  type StoredReminder,
  rowToReminder,
} from './types';

// esbuild rewrites a static `node:sqlite` import to a bare "sqlite" specifier, which
// is not a real module and fails at runtime in the bundled build. Reaching the
// built-in through createRequire survives bundling untouched.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as {
  DatabaseSync: typeof DatabaseSyncClass;
};

/**
 * SQLite store for the Node/Docker/VPS deployment.
 *
 * Built on `node:sqlite` rather than a native addon, so the Docker image needs no
 * compiler and `npm install` never has to build anything.
 */
export class SqliteReminderStore implements ReminderStore {
  private readonly db: DatabaseSyncClass;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode = WAL');
  }

  async init(): Promise<void> {
    this.db.exec(CREATE_TABLE_SQL);
    for (const sql of CREATE_INDEX_SQL) this.db.exec(sql);
  }

  async insert(reminder: StoredReminder): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO reminders (id, device_id, kind, fire_at, payload, status, attempts, last_error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        reminder.id,
        reminder.deviceId,
        reminder.kind,
        reminder.fireAt,
        reminder.payload,
        reminder.status,
        reminder.attempts,
        reminder.lastError,
        reminder.createdAt,
      );
  }

  async listByDevice(deviceId: string, limit: number): Promise<StoredReminder[]> {
    const rows = this.db
      .prepare(`SELECT * FROM reminders WHERE device_id = ? ORDER BY fire_at DESC LIMIT ?`)
      .all(deviceId, limit) as unknown as ReminderRow[];
    return rows.map(rowToReminder);
  }

  async countPending(deviceId: string): Promise<number> {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM reminders WHERE device_id = ? AND status = 'pending'`)
      .get(deviceId) as unknown as { n: number } | undefined;
    return Number(row?.n ?? 0);
  }

  async due(now: number, limit: number): Promise<StoredReminder[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM reminders WHERE status = 'pending' AND fire_at <= ? ORDER BY fire_at ASC LIMIT ?`,
      )
      .all(now, limit) as unknown as ReminderRow[];
    return rows.map(rowToReminder);
  }

  async markSent(id: string): Promise<void> {
    this.db.prepare(`UPDATE reminders SET status = 'sent' WHERE id = ?`).run(id);
  }

  async markFailed(id: string, error: string, attempts: number): Promise<void> {
    // Give up after three tries so a permanently broken webhook stops being retried.
    this.db
      .prepare(
        `UPDATE reminders SET status = CASE WHEN ? >= 3 THEN 'failed' ELSE 'pending' END,
           attempts = ?, last_error = ? WHERE id = ?`,
      )
      .run(attempts, attempts, error, id);
  }

  async cancel(id: string, deviceId: string): Promise<boolean> {
    const result = this.db
      .prepare(`UPDATE reminders SET status = 'cancelled' WHERE id = ? AND device_id = ?`)
      .run(id, deviceId);
    return Number(result.changes) > 0;
  }

  async purgeBefore(instant: number): Promise<number> {
    const result = this.db
      .prepare(`DELETE FROM reminders WHERE status != 'pending' AND fire_at < ?`)
      .run(instant);
    return Number(result.changes);
  }
}
