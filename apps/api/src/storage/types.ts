export interface StoredReminder {
  id: string;
  /** Owner token generated in the browser — there are no accounts. */
  deviceId: string;
  kind: string;
  fireAt: number;
  /** AES-GCM encrypted `{ message, targets, locale }`. */
  payload: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  lastError: string | null;
  createdAt: number;
}

/**
 * Storage seam between the two runtimes: D1 on Cloudflare, `node:sqlite` on a server.
 * Everything above this interface is shared code.
 */
export interface ReminderStore {
  init(): Promise<void>;
  insert(reminder: StoredReminder): Promise<void>;
  listByDevice(deviceId: string, limit: number): Promise<StoredReminder[]>;
  countPending(deviceId: string): Promise<number>;
  due(now: number, limit: number): Promise<StoredReminder[]>;
  markSent(id: string): Promise<void>;
  markFailed(id: string, error: string, attempts: number): Promise<void>;
  cancel(id: string, deviceId: string): Promise<boolean>;
  /** Deletes finished reminders older than `instant`; returns how many went. */
  purgeBefore(instant: number): Promise<number>;
}

export const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  fire_at INTEGER NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL
)`;

export const CREATE_INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (status, fire_at)`,
  `CREATE INDEX IF NOT EXISTS idx_reminders_device ON reminders (device_id, fire_at)`,
];

interface ReminderRow {
  id: string;
  device_id: string;
  kind: string;
  fire_at: number;
  payload: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: number;
}

export function rowToReminder(row: ReminderRow): StoredReminder {
  return {
    id: row.id,
    deviceId: row.device_id,
    kind: row.kind,
    fireAt: Number(row.fire_at),
    payload: row.payload,
    status: row.status as StoredReminder['status'],
    attempts: Number(row.attempts),
    lastError: row.last_error,
    createdAt: Number(row.created_at),
  };
}

export type { ReminderRow };
