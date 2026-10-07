import { NextResponse } from 'next/server';

import { orderCreateInputSchema, type UploadInstructions } from '@crimson-copies/shared';

import { getAuthenticatedUser } from '../../../lib/customer-identity';
import { callOrdersApi } from '../../../lib/internal-api';
import { setUploadTokenCookie } from '../../../lib/upload-token-cookie';

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

  const result = await callOrdersApi<OrderCreateResult>({
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

  if (result.status !== 201 || !isOrderCreateResult(result.body)) {
    return NextResponse.json(result.body, { status: result.status });
  }

  // The upload credential goes into an HttpOnly cookie scoped to this order and is dropped from
  // the JSON, so browser JavaScript never holds it and a refresh doesn't lose it.
  const { password, ...uploadInstructions } = result.body.uploadInstructions;
  const response = NextResponse.json(
    { orderId: result.body.orderId, uploadInstructions },
    { status: 201 },
  );
  setUploadTokenCookie(response, result.body.orderId, password, uploadInstructions.expiresAt);
  return response;
}

interface OrderCreateResult {
  orderId: number;
  uploadInstructions: UploadInstructions;
}

function isOrderCreateResult(value: unknown): value is OrderCreateResult {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<OrderCreateResult>;
  return (
    typeof candidate.orderId === 'number' &&
    typeof candidate.uploadInstructions?.password === 'string' &&
    typeof candidate.uploadInstructions.expiresAt === 'string'
  );
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