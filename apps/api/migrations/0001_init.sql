-- Apply with: wrangler d1 migrations apply evcp
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
);

CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (status, fire_at);
CREATE INDEX IF NOT EXISTS idx_reminders_device ON reminders (device_id, fire_at);
