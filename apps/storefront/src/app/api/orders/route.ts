import { NextResponse } from 'next/server';

import { orderCreateInputSchema } from '@crimson-copies/shared';

import { callOrdersApi } from '../../../lib/internal-api';
import { auth0 } from '../../../lib/auth0';
import { getSession } from '../../../lib/session';

async function getAuthenticatedUser() {
  const localSession = await getSession();

  if (localSession) {
    return {
      userId: String(localSession.userId),
      role: localSession.role,
    };
  }

  const authSession = await auth0.getSession();
  const email = authSession?.user?.email;

  if (!email) {
    return {
      userId: undefined,
      role: undefined,
    };
  }

  const result = await callOrdersApi<{
    userId: number;
    username: string;
    role: 'customer' | 'staff';
  }>({
    method: 'POST',
    path: '/internal/auth/verify-auth0-email',
    body: { email },
  });

  if (result.status !== 200) {
    console.error('Auth0 user verification failed:', result);
    return {
      userId: undefined,
      role: undefined,
    };
  }

  return {
    userId: String(result.body.userId),
    role: result.body.role,
  };
}

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

  const user = await getAuthenticatedUser();

  const result = await callOrdersApi({
    method: 'POST',
    path: '/api/orders',
    role: user.role,
    userId: user.userId,
    body: parsed.data,
  });

  console.log('POST /api/orders: request completed', {
    status: result.status,
    userId: user.userId,
  });

  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(): Promise<NextResponse> {
  console.log('GET /api/orders: request received');

  const user = await getAuthenticatedUser();

  const result = await callOrdersApi({
    method: 'GET',
    path: '/api/orders',
    role: user.role,
    userId: user.userId,
    searchParams: { mine: 'true' },
  });

  console.log('GET /api/orders: request completed', {
    status: result.status,
    userId: user.userId,
  });

  return NextResponse.json(result.body, { status: result.status });
}