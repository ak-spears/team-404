import type { NotifySendInput } from '@crimson-copies/shared';
import type { OrdersRepository } from '../repositories/orders-repository.js';
import { sendNotification } from './notify-client.js';

export interface NotifyDeps {
  notifyUrl: string;
  internalApiKey: string;
  repository: OrdersRepository;
}

/**
 * Fire-and-forget from the caller's perspective: awaited here so the outcome is recorded
 * deterministically as an `order_events` row (`email_sent` / `email_send_failed`), but a notify
 * failure never throws -- it does not block or fail whatever primary action (order creation,
 * file registration, status change) triggered it.
 */
export async function doNotifyThing(
  deps: NotifyDeps,
  orderId: number,
  input: NotifySendInput,
): Promise<void> {
  const result = await sendNotification(deps.notifyUrl, deps.internalApiKey, input);
  if (result.ok) {
    await deps.repository.recordEvent(orderId, 'email_sent', 'system', { template: input.template });
    console.log('notification sent', { orderId, template: input.template });
  } else {
    await deps.repository.recordEvent(orderId, 'email_send_failed', 'system', {
      template: input.template,
      error: result.error,
    });
    console.error('notification send failed', { orderId, template: input.template, error: result.error });
  }
}
