import { telegramChannel } from './telegram';
import { wecomChannel } from './wecom';
import type {
  DeliveryResult,
  NotificationChannel,
  NotificationChannelType,
  NotificationMessage,
  NotificationTarget,
} from './types';

const CHANNELS: Record<NotificationChannelType, NotificationChannel> = {
  telegram: telegramChannel as NotificationChannel,
  wecom: wecomChannel as NotificationChannel,
};

export function getChannel(type: NotificationChannelType): NotificationChannel {
  return CHANNELS[type];
}

/**
 * Sends one message to every configured target.
 *
 * Delivery failures are returned rather than thrown: one broken webhook should not
 * stop the other channels, and the caller decides whether to retry.
 */
export async function dispatch(
  targets: readonly NotificationTarget[],
  message: NotificationMessage,
): Promise<DeliveryResult[]> {
  return Promise.all(
    targets.map(async (target) => {
      const channel = getChannel(target.type);
      if (!channel) {
        return { channel: target.type, ok: false, error: 'unsupported channel' };
      }
      return channel.send(target, message);
    }),
  );
}
