import type { Locale } from '@evcp/models';
import type { NotificationMessage, NotificationTarget, ReminderKind } from '@evcp/notification';

export interface ScheduleReminderRequest {
  deviceId: string;
  kind: ReminderKind;
  fireAt: number;
  message: NotificationMessage;
  targets: NotificationTarget[];
  locale: Locale;
}

async function request<T>(baseUrl: string, path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `HTTP ${response.status}`);
  }
  return payload as T;
}

/**
 * Thin client for the optional backend.
 *
 * Every call site treats a missing `baseUrl` as "no backend configured" and falls
 * back to calendar reminders, so a static-only deployment stays fully functional.
 */
export const api = {
  scheduleReminder: (baseUrl: string, body: ScheduleReminderRequest) =>
    request<{ id: string }>(baseUrl, '/api/reminders', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  cancelReminder: (baseUrl: string, id: string, deviceId: string) =>
    request<{ ok: true }>(baseUrl, `/api/reminders/${id}?deviceId=${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
    }),

  notifyNow: (baseUrl: string, targets: NotificationTarget[], message: NotificationMessage) =>
    request<{ results: { channel: string; ok: boolean; error?: string }[] }>(
      baseUrl,
      '/api/notify',
      { method: 'POST', body: JSON.stringify({ targets, message }) },
    ),
};

export function buildTargets(settings: {
  telegram: { enabled: boolean; botToken: string; chatId: string };
  wecom: { enabled: boolean; webhookUrl: string };
}): NotificationTarget[] {
  const targets: NotificationTarget[] = [];
  if (settings.telegram.enabled && settings.telegram.botToken && settings.telegram.chatId) {
    targets.push({
      type: 'telegram',
      botToken: settings.telegram.botToken,
      chatId: settings.telegram.chatId,
    });
  }
  if (settings.wecom.enabled && settings.wecom.webhookUrl) {
    targets.push({ type: 'wecom', webhookUrl: settings.wecom.webhookUrl });
  }
  return targets;
}
