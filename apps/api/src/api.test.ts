import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AppConfig } from './app';
import { decryptJson, encryptJson } from './crypto';
import { dispatchDueReminders } from './dispatcher';
import { SqliteReminderStore } from './storage/sqlite';
import type { StoredReminder } from './storage/types';

const KEY = 'test-encryption-key';
const DEVICE = 'device-0123456789';

function makeConfig(store: SqliteReminderStore): AppConfig {
  return {
    store,
    encryptionKey: KEY,
    allowedOrigins: '*',
    maxPendingPerDevice: 3,
    defaultTariffId: 'cn-generic-tou',
  };
}

let store: SqliteReminderStore;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  store = new SqliteReminderStore(':memory:');
  await store.init();
  app = createApp(makeConfig(store));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const telegramTarget = { type: 'telegram' as const, botToken: 'x'.repeat(20), chatId: '42' };
const message = { title: 'Test', body: 'Body' };

describe('crypto', () => {
  it('round-trips a payload', async () => {
    const encrypted = await encryptJson({ hello: 'world' }, KEY);
    expect(encrypted).not.toContain('world');
    await expect(decryptJson(encrypted, KEY)).resolves.toEqual({ hello: 'world' });
  });

  it('produces a different ciphertext each time', async () => {
    const a = await encryptJson({ v: 1 }, KEY);
    const b = await encryptJson({ v: 1 }, KEY);
    expect(a).not.toBe(b);
  });

  it('refuses to decrypt with the wrong key', async () => {
    const encrypted = await encryptJson({ v: 1 }, KEY);
    await expect(decryptJson(encrypted, 'other-key')).rejects.toThrow();
  });

  it('rejects a malformed payload', async () => {
    await expect(decryptJson('garbage', KEY)).rejects.toThrow(/malformed/);
  });
});

describe('GET /api/health', () => {
  it('reports the bundled database sizes', async () => {
    const response = await app.request('/api/health');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; vehicles: number };
    expect(body.ok).toBe(true);
    expect(body.vehicles).toBeGreaterThan(0);
  });
});

describe('POST /api/plan', () => {
  it('returns the same numbers as the client-side engine', async () => {
    const response = await app.request('/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        vehicle: {
          id: 'byd-yuan-up-401',
          brand: 'BYD',
          model: 'Yuan UP',
          batteryCapacityKwh: 45.12,
          batteryType: 'LFP',
          acMaxKw: 6.6,
          dcMaxKw: 65,
          verified: false,
        },
        chargerPowerKw: 7,
        currentSoc: 35,
        targetSoc: 85,
        strategy: 'asap',
        plugInAt: Date.UTC(2026, 6, 27, 15),
        timeZone: 'Asia/Shanghai',
      }),
    });

    expect(response.status).toBe(200);
    const { plan } = (await response.json()) as { plan: { chargingMinutes: number; gridKwh: number } };
    expect(Math.round(plan.chargingMinutes)).toBe(223);
    expect(plan.gridKwh).toBeCloseTo(24.522, 2);
  });

  it('rejects an invalid input with the validation issues', async () => {
    const response = await app.request('/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentSoc: 35 }),
    });
    expect(response.status).toBe(400);
  });
});

describe('reminders', () => {
  const schedule = (overrides: Record<string, unknown> = {}) =>
    app.request('/api/reminders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: DEVICE,
        kind: 'chargeStart',
        fireAt: Date.now() + 60_000,
        message,
        targets: [telegramTarget],
        locale: 'zh-CN',
        ...overrides,
      }),
    });

  it('stores the payload encrypted', async () => {
    const response = await schedule();
    expect(response.status).toBe(201);

    const rows = await store.listByDevice(DEVICE, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload).not.toContain(telegramTarget.botToken);
    await expect(decryptJson(rows[0]!.payload, KEY)).resolves.toMatchObject({
      targets: [telegramTarget],
    });
  });

  it('never returns the encrypted payload over the API', async () => {
    await schedule();
    const response = await app.request(`/api/reminders?deviceId=${DEVICE}`);
    const body = (await response.json()) as { reminders: Record<string, unknown>[] };
    expect(body.reminders[0]).not.toHaveProperty('payload');
    expect(body.reminders[0]).toMatchObject({ kind: 'chargeStart', status: 'pending' });
  });

  it('requires a device id to list', async () => {
    expect((await app.request('/api/reminders')).status).toBe(400);
  });

  it('caps how many a single device can queue', async () => {
    await schedule();
    await schedule();
    await schedule();
    expect((await schedule()).status).toBe(429);
  });

  it('rejects a schedule far in the future', async () => {
    const response = await schedule({ fireAt: Date.now() + 400 * 24 * 3_600_000 });
    expect(response.status).toBe(400);
  });

  it('only lets the owning device cancel', async () => {
    const created = (await (await schedule()).json()) as { id: string };

    const wrongOwner = await app.request(
      `/api/reminders/${created.id}?deviceId=someone-elses-device`,
      { method: 'DELETE' },
    );
    expect(wrongOwner.status).toBe(404);

    const owner = await app.request(`/api/reminders/${created.id}?deviceId=${DEVICE}`, {
      method: 'DELETE',
    });
    expect(owner.status).toBe(200);
    expect(await store.due(Date.now() + 120_000, 10)).toHaveLength(0);
  });
});

describe('webhook host allowlist', () => {
  it('refuses to forward to an arbitrary host', async () => {
    const response = await app.request('/api/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targets: [{ type: 'wecom', webhookUrl: 'http://169.254.169.254/latest/meta-data' }],
        message,
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'webhook host not allowed' });
  });

  it('allows the WeCom endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ errcode: 0 }), { status: 200 })),
    );

    const response = await app.request('/api/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targets: [
          { type: 'wecom', webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc' },
        ],
        message,
      }),
    });
    expect(response.status).toBe(200);
  });

  it('applies the same rule when scheduling', async () => {
    const response = await app.request('/api/reminders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: DEVICE,
        kind: 'chargeStart',
        fireAt: Date.now() + 60_000,
        message,
        targets: [{ type: 'wecom', webhookUrl: 'https://evil.example.com/hook' }],
      }),
    });
    expect(response.status).toBe(400);
  });
});

describe('dispatchDueReminders', () => {
  const insertDue = async (fireAt: number): Promise<StoredReminder> => {
    const reminder: StoredReminder = {
      id: crypto.randomUUID(),
      deviceId: DEVICE,
      kind: 'chargeStart',
      fireAt,
      payload: await encryptJson({ message, targets: [telegramTarget], locale: 'zh-CN' }, KEY),
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: Date.now(),
    };
    await store.insert(reminder);
    return reminder;
  };

  it('sends what is due and leaves the rest alone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    await insertDue(Date.now() - 1000);
    await insertDue(Date.now() + 3_600_000);

    const summary = await dispatchDueReminders(store, KEY);
    expect(summary).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(await store.due(Date.now(), 10)).toHaveLength(0);
  });

  it('records the error and retries a transient failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: false, description: 'boom' }), { status: 500 })),
    );

    await insertDue(Date.now() - 1000);
    const summary = await dispatchDueReminders(store, KEY);
    expect(summary.failed).toBe(1);

    const rows = await store.listByDevice(DEVICE, 10);
    expect(rows[0]!.attempts).toBe(1);
    expect(rows[0]!.status).toBe('pending');
    expect(rows[0]!.lastError).toContain('boom');
  });

  it('gives up after three attempts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: false, description: 'boom' }), { status: 500 })),
    );

    await insertDue(Date.now() - 1000);
    await dispatchDueReminders(store, KEY);
    await dispatchDueReminders(store, KEY);
    await dispatchDueReminders(store, KEY);

    const rows = await store.listByDevice(DEVICE, 10);
    expect(rows[0]!.status).toBe('failed');
    expect(await store.due(Date.now(), 10)).toHaveLength(0);
  });

  it('does not retry a payload it cannot decrypt', async () => {
    const reminder = await insertDue(Date.now() - 1000);
    // Simulate a rotated encryption key.
    const summary = await dispatchDueReminders(store, 'a-different-key');
    expect(summary.failed).toBe(1);

    const rows = await store.listByDevice(reminder.deviceId, 10);
    expect(rows[0]!.status).toBe('failed');
  });
});

describe('telegram webhook', () => {
  it('answers /plan with an estimate', async () => {
    const response = await app.request('/api/telegram/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: { text: '/plan 35 85', chat: { id: 7 } } }),
    });

    const body = (await response.json()) as { method?: string; text?: string };
    expect(body.method).toBe('sendMessage');
    expect(body.text).toContain('35% → 85%');
  });

  it('explains itself when the command makes no sense', async () => {
    const response = await app.request('/api/telegram/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: { text: '/plan banana', chat: { id: 7 } } }),
    });
    const body = (await response.json()) as { text?: string };
    expect(body.text).toContain('Usage');
  });

  it('ignores unrelated updates', async () => {
    const response = await app.request('/api/telegram/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: { text: 'hello', chat: { id: 7 } } }),
    });
    expect(await response.json()).toEqual({ ok: true });
  });

  it('rejects a request without the configured secret', async () => {
    const guarded = createApp({ ...makeConfig(store), telegramWebhookSecret: 'shh' });
    const response = await guarded.request('/api/telegram/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: { text: '/plan 35', chat: { id: 7 } } }),
    });
    expect(response.status).toBe(403);
  });
});
