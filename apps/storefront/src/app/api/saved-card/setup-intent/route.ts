import { NextResponse } from 'next/server';

import { getAuthenticatedUser } from '../../../../lib/customer-identity';
import { getOrCreateStripeCustomerId, getStripe } from '../../../../lib/stripe';

export async function POST(): Promise<NextResponse> {
  const user = await getAuthenticatedUser();

  if (!user.userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const customerId = await getOrCreateStripeCustomerId(user.userId);
    const intent = await getStripe().setupIntents.create({
      customer: customerId,
      usage: 'off_session',
    });

    return NextResponse.json({ clientSecret: intent.client_secret });
  } catch (err) {
    console.error('setup-intent failed:', err);
    return NextResponse.json({ error: 'setup_failed' }, { status: 502 });
  }
}
