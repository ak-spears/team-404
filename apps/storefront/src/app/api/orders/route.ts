import { NextResponse } from 'next/server';
import { orderCreateInputSchema } from '@crimson-copies/shared';
import { callOrdersApi } from '../../../lib/internal-api';
import { getSession } from '../../../lib/session';

/**
 * BFF for `POST /api/orders`. Forwards the signed-in customer's identity when one exists;
 * otherwise this is a guest order -- the browser never talks to orders-api directly, and never
 * sees `INTERNAL_API_KEY` either way.
 */
export async function POST(request: Request): Promise<NextResponse> {
  console.log('POST /api/orders: request received');

  const json = await request.json().catch(() => undefined);
  const parsed = orderCreateInputSchema.safeParse(json);
  if (!parsed.success) {
    console.error('POST /api/orders: validation failed', parsed.error.issues);
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const session = await getSession();
  const result = await callOrdersApi({
    method: 'POST',
    path: '/api/orders',
    role: session?.role,
    userId: session ? String(session.userId) : undefined,
    body: parsed.data,
  });

  const responseStatus = result.status;
  console.log('POST /api/orders: request completed', { status: responseStatus });
  return NextResponse.json(result.body, { status: responseStatus });
}

/**
 * BFF for `GET /api/orders?mine=true` (the storefront's own "my orders" list). Without a
 * signed-in session this always renders empty -- see orders-api's `mine`-filter logic, which
 * treats an anonymous caller's "mine" request as an empty list rather than an error.
 */
export async function GET(): Promise<NextResponse> {
  console.log('GET /api/orders: request received');

  const session = await getSession();
  const result = await callOrdersApi({
    method: 'GET',
    path: '/api/orders',
    role: session?.role,
    userId: session ? String(session.userId) : undefined,
    searchParams: { mine: 'true' },
  });

  const responseStatus = result.status;
  console.log('GET /api/orders: request completed', { status: responseStatus });
  return NextResponse.json(result.body, { status: responseStatus });
}
