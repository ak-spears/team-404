import type { NotifySendInput } from '@crimson-copies/shared';

export type SendNotificationResult = { ok: true } | { ok: false; error: string };

/**
 * Calls services/notify's `POST /internal/send`. Never throws -- a failure (network error,
 * timeout, non-2xx) is reported in the return value so the caller can decide what to log.
 */
export async function sendNotification(
  notifyUrl: string,
  internalApiKey: string,
  input: NotifySendInput,
): Promise<SendNotificationResult> {
  try {
    const response = await fetch(`${notifyUrl}/internal/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-key': internalApiKey },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return { ok: false, error: `notify responded ${response.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
