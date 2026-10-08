import { NextResponse } from 'next/server';
import { loadConfig } from '../../../../../../lib/config';
import { getStaffSession } from '../../../../../../lib/session';

interface RouteParams {
  params: Promise<{ id: string; fileId: string }>;
}

/** Response headers passed through from orders-api, which sets them per file. */
const PASSTHROUGH_HEADERS = [
  'content-type',
  'content-length',
  'content-disposition',
  'x-content-type-options',
  'content-security-policy',
  'cache-control',
];

const POSITIVE_INTEGER_ID = /^[1-9]\d{0,15}$/;

/**
 * Opens one uploaded order file in a staff browser tab (PDFs and images inline, ready to print).
 * Staff session required; the bytes are streamed from orders-api, which reads them from MinIO
 * over 127.0.0.1 -- the browser never needs to reach MinIO itself.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id, fileId } = await params;
  if (!POSITIVE_INTEGER_ID.test(id) || !POSITIVE_INTEGER_ID.test(fileId)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const config = loadConfig();
  let upstream: Response;
  try {
    upstream = await fetch(new URL(`/api/orders/${id}/files/${fileId}/content`, config.ORDERS_API_URL), {
      headers: {
        'X-Internal-Key': config.INTERNAL_API_KEY,
        'X-User-Role': session.role,
        'X-User-Id': String(session.userId),
      },
    });
  } catch (err) {
    console.error('GET /api/orders/:id/files/:fileId: upstream call failed', {
      orderId: id,
      fileId,
      errorName: err instanceof Error ? err.name : 'UnknownError',
    });
    return NextResponse.json({ error: 'download_failed' }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const body: unknown = await upstream.json().catch(() => undefined);
    console.error('GET /api/orders/:id/files/:fileId: request completed', {
      orderId: id,
      fileId,
      status: upstream.status,
    });
    return NextResponse.json(body ?? { error: 'download_failed' }, { status: upstream.status });
  }

  const headers = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  console.log('GET /api/orders/:id/files/:fileId: request completed', { orderId: id, fileId, status: 200 });
  return new Response(upstream.body, { status: 200, headers });
}
