import type {
  DeliveryResult,
  NotificationChannel,
  NotificationMessage,
  telegramTargetSchema,
} from './types';
import type { z } from 'zod';

type TelegramTarget = z.infer<typeof telegramTargetSchema>;

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Renders our small Markdown subset as Telegram HTML.
 *
 * HTML mode is used rather than MarkdownV2 because the latter requires escaping a
 * dozen punctuation characters that appear naturally in prices and times.
 */
export function toTelegramHtml(message: NotificationMessage): string {
  const body = escapeHtml(message.body).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const parts = [`<b>${escapeHtml(message.title)}</b>`, body];
  if (message.url) parts.push(`<a href="${escapeHtml(message.url)}">${escapeHtml(message.url)}</a>`);
  return parts.join('\n\n');
}

export const telegramChannel: NotificationChannel<TelegramTarget> = {
  type: 'telegram',

  async send(target, message): Promise<DeliveryResult> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${target.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: target.chatId,
          text: toTelegramHtml(message),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; description?: string }
        | null;

      if (!response.ok || payload?.ok === false) {
        return {
          channel: 'telegram',
          ok: false,
          error: payload?.description ?? `HTTP ${response.status}`,
        };
      }
      return { channel: 'telegram', ok: true };
    } catch (error) {
      return { channel: 'telegram', ok: false, error: (error as Error).message };
    }
  },
};
