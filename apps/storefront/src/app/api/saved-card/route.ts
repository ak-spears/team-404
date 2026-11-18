import { NextResponse } from 'next/server';

import { getAuthenticatedUser } from '../../../lib/customer-identity';
import { getOrCreateStripeCustomerId, getStripe } from '../../../lib/stripe';

export async function GET(): Promise<NextResponse> {
  const user = await getAuthenticatedUser();
  if (!user.userId) {
    return NextResponse.json({ saved: false });
  }

  try {
    const customerId = await getOrCreateStripeCustomerId(user.userId);
    const methods = await getStripe().paymentMethods.list({ customer: customerId, type: 'card' });
    const card = methods.data[0]?.card;
    if (!card) return NextResponse.json({ saved: false });
    return NextResponse.json({
      saved: true,
      brand: card.brand,
      last4: card.last4,
      expMonth: card.exp_month,
      expYear: card.exp_year,
    });
  } catch (err) {
    console.error('saved-card lookup failed:', err);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 502 });
  }
}

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
    console.error('saved-card setup failed:', err);
    return NextResponse.json({ error: 'setup_failed' }, { status: 502 });
  }
}
