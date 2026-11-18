import Stripe from 'stripe';

import { callOrdersApi } from './internal-api';

let client: Stripe | undefined;

/** Server-only Stripe client. Never import this from a client component. */
export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    client = new Stripe(key);
  }
  return client;
}

function normalizeUserId(userId: number | string): number {
  const parsed = typeof userId === 'number' ? userId : Number(userId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Invalid Stripe customer user id');
  }
  return parsed;
}

export async function getStripeCustomerId(userId: number | string): Promise<string | null> {
  const normalizedUserId = normalizeUserId(userId);
  const result = await callOrdersApi<{ customerId: string | null }>({
    method: 'GET',
    path: '/internal/stripe/customer',
    userId: String(normalizedUserId),
  });

  if (result.status !== 200) {
    throw new Error(`Failed to fetch Stripe customer id for user ${normalizedUserId}`);
  }

  return result.body.customerId ?? null;
}

export async function getOrCreateStripeCustomerId(userId: number | string): Promise<string> {
  const normalizedUserId = normalizeUserId(userId);
  const existingCustomerId = await getStripeCustomerId(normalizedUserId);
  if (existingCustomerId) return existingCustomerId;

  const created = await getStripe().customers.create({
    metadata: { userId: String(normalizedUserId) },
  });

  const saved = await callOrdersApi<{ ok?: boolean }>({
    method: 'POST',
    path: '/internal/stripe/customer',
    userId: String(normalizedUserId),
    body: { stripeCustomerId: created.id },
  });

  if (saved.status !== 200) {
    throw new Error(`Failed to persist Stripe customer id for user ${normalizedUserId}`);
  }

  return created.id;
}

export async function createSetupIntent(userId: number | string) {
  const normalizedUserId = normalizeUserId(userId);
  const customerId = await getOrCreateStripeCustomerId(normalizedUserId);

  return getStripe().setupIntents.create({
    customer: customerId,
  });
}
