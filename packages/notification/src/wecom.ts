import type {
  DeliveryResult,
  NotificationChannel,
  NotificationMessage,
  wecomTargetSchema,
} from './types';
import type { z } from 'zod';

type WecomTarget = z.infer<typeof wecomTargetSchema>;

/** WeCom rejects payloads over 4096 bytes outright. */
const MAX_CONTENT_BYTES = 4000;

function truncateToBytes(value: string, limit: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).length <= limit) return value;

  let result = '';
  let bytes = 0;
  for (const char of value) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit - 3) break;
    result += char;
    bytes += size;
  }
  return `${result}...`;
}

/** WeCom group-bot markdown: `**bold**` works, headings do not. */
export function toWecomMarkdown(message: NotificationMessage): string {
  const parts = [`**${message.title}**`, message.body];
  if (message.url) parts.push(`[${message.url}](${message.url})`);
  return truncateToBytes(parts.join('\n\n'), MAX_CONTENT_BYTES);
}

export const wecomChannel: NotificationChannel<WecomTarget> = {
  type: 'wecom',

  async send(target, message): Promise<DeliveryResult> {
    try {
      const response = await fetch(target.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: { content: toWecomMarkdown(message) },
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { errcode?: number; errmsg?: string }
        | null;

      if (!response.ok || (payload?.errcode ?? 0) !== 0) {
        return {
          channel: 'wecom',
          ok: false,
          error: payload?.errmsg ?? `HTTP ${response.status}`,
        };
      }
      return { channel: 'wecom', ok: true };
    } catch (error) {
      return { channel: 'wecom', ok: false, error: (error as Error).message };
    }
  },
};
