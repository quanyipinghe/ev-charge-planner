import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChargePlan } from '@evcp/models';
import { buildCalendar, escapeIcsText, foldLine, toIcsDate } from './ics';
import { toTelegramHtml, telegramChannel } from './telegram';
import { toWecomMarkdown, wecomChannel } from './wecom';
import { formatClock, formatDuration, formatMoney, renderPlanMessages } from './render';
import { dispatch } from './dispatch';
import { notificationTargetSchema } from './types';

const plan: ChargePlan = {
  feasible: true,
  reachableSoc: 85,
  strategy: 'balanced',
  startAt: Date.UTC(2026, 6, 27, 19, 17), // 03:17 Shanghai on the 28th
  endAt: Date.UTC(2026, 6, 27, 23, 0), // 07:00 Shanghai
  spanMinutes: 223,
  chargingMinutes: 222.9,
  crossesMidnight: true,
  startSoc: 35,
  endSoc: 85,
  batteryKwh: 22.56,
  gridKwh: 24.52,
  lossKwh: 1.96,
  segments: [],
  socCurve: [],
  cost: {
    total: 7.36,
    currency: 'CNY',
    byLevel: { valley: 7.36, flat: 0, peak: 0, sharp: 0, unknown: 0 },
    tierSurcharge: 0,
    serviceFee: 0,
    effectivePricePerKwh: 0.3,
  },
  levelShare: { valley: 1, flat: 0, peak: 0, sharp: 0, unknown: 0 },
  highSocDwellMinutes: 12,
  warnings: [],
};

describe('ICS generation', () => {
  it('escapes the characters that carry meaning in a TEXT value', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('formats instants as UTC basic timestamps', () => {
    expect(toIcsDate(Date.UTC(2026, 6, 27, 15, 0, 0))).toBe('20260727T150000Z');
  });

  it('folds long lines by octet count, not character count', () => {
    const folded = foldLine(`SUMMARY:${'充'.repeat(40)}`);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(lines.slice(1).every((line) => line.startsWith(' '))).toBe(true);
  });

  it('leaves short lines untouched', () => {
    expect(foldLine('VERSION:2.0')).toBe('VERSION:2.0');
  });

  it('builds a calendar with an alarm and CRLF line endings', () => {
    const ics = buildCalendar(
      [
        {
          uid: 'evcp-start-1@evchargeplanner',
          start: plan.startAt,
          end: plan.endAt,
          summary: '开始充电',
          description: '元UP 35% → 85%',
          alarmMinutesBefore: 10,
        },
      ],
      { calendarName: 'EVChargePlanner' },
    );

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('UID:evcp-start-1@evchargeplanner');
    expect(ics).toContain('DTSTART:20260727T191700Z');
    expect(ics).toContain('TRIGGER:-PT10M');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics.split('\n').every((line) => line === '' || line.endsWith('\r'))).toBe(true);
  });

  it('omits the alarm block when no lead time is given', () => {
    const ics = buildCalendar([{ uid: 'x', start: plan.startAt, summary: 'test' }]);
    expect(ics).not.toContain('BEGIN:VALARM');
  });
});

describe('message rendering', () => {
  it('rounds the clock to the nearest minute', () => {
    // 07:54:55 local should read as 07:55, not 07:54.
    const instant = Date.UTC(2026, 6, 27, 23, 54, 55);
    expect(formatClock(instant, 'Asia/Shanghai')).toBe('07:55');
  });

  it('formats durations per locale', () => {
    expect(formatDuration(222.9, 'zh-CN')).toBe('3小时43分钟');
    expect(formatDuration(222.9, 'en')).toBe('3h 43m');
    expect(formatDuration(222.9, 'ja')).toBe('3時間43分');
    expect(formatDuration(45, 'en')).toBe('45m');
  });

  it('formats money with a currency symbol', () => {
    expect(formatMoney(7.356, 'CNY')).toBe('¥7.36');
    expect(formatMoney(7.356, 'GBP')).toBe('GBP 7.36');
  });

  it('includes the key numbers in the start message', () => {
    const { start, complete } = renderPlanMessages(plan, {
      locale: 'zh-CN',
      timeZone: 'Asia/Shanghai',
      vehicleName: '比亚迪 元UP',
    });

    expect(start.title).toContain('开始充电');
    expect(start.body).toContain('03:17');
    expect(start.body).toContain('07:00');
    expect(start.body).toContain('35% → 85%');
    expect(start.body).toContain('¥7.36');
    expect(start.body).toContain('谷电占比: 100%');
    expect(complete.body).toContain('已充至 85%');
  });

  it('renders English and Japanese too', () => {
    const en = renderPlanMessages(plan, {
      locale: 'en',
      timeZone: 'Asia/Shanghai',
      vehicleName: 'BYD Yuan UP',
    });
    expect(en.start.title).toContain('Time to start charging');

    const ja = renderPlanMessages(plan, {
      locale: 'ja',
      timeZone: 'Asia/Shanghai',
      vehicleName: 'BYD 元UP',
    });
    expect(ja.start.title).toContain('充電開始');
  });

  it('appends the app link when one is configured', () => {
    const { start } = renderPlanMessages(plan, {
      locale: 'en',
      timeZone: 'Asia/Shanghai',
      vehicleName: 'Test',
      appUrl: 'https://example.com/plan',
    });
    expect(start.url).toBe('https://example.com/plan');
  });
});

describe('channel formatting', () => {
  it('converts bold markdown to Telegram HTML and escapes the rest', () => {
    const html = toTelegramHtml({ title: 'A & B', body: '**bold** <script>' });
    expect(html).toContain('<b>A &amp; B</b>');
    expect(html).toContain('<b>bold</b>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('keeps WeCom markdown under the payload limit', () => {
    const content = toWecomMarkdown({ title: 'T', body: '充'.repeat(3000) });
    expect(new TextEncoder().encode(content).length).toBeLessThanOrEqual(4000);
    expect(content.endsWith('...')).toBe(true);
  });
});

describe('dispatch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates target shapes', () => {
    expect(
      notificationTargetSchema.safeParse({ type: 'telegram', botToken: 'x'.repeat(20), chatId: '1' })
        .success,
    ).toBe(true);
    expect(notificationTargetSchema.safeParse({ type: 'wecom', webhookUrl: 'nope' }).success).toBe(
      false,
    );
  });

  it('reports success for each target', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, errcode: 0 }), { status: 200 })),
    );

    const results = await dispatch(
      [
        { type: 'telegram', botToken: 'x'.repeat(20), chatId: '42' },
        { type: 'wecom', webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc' },
      ],
      { title: 'T', body: 'B' },
    );

    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.map((r) => r.channel)).toEqual(['telegram', 'wecom']);
  });

  it('surfaces an API error without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: false, description: 'chat not found' }), { status: 400 })),
    );

    const result = await telegramChannel.send(
      { type: 'telegram', botToken: 'x'.repeat(20), chatId: 'bad' },
      { title: 'T', body: 'B' },
    );
    expect(result).toEqual({ channel: 'telegram', ok: false, error: 'chat not found' });
  });

  it('surfaces a network failure without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    const result = await wecomChannel.send(
      { type: 'wecom', webhookUrl: 'https://example.com/hook' },
      { title: 'T', body: 'B' },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('network down');
  });
});
