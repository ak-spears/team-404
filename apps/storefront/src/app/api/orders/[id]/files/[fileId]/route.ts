import { NextResponse } from 'next/server';
import { loadConfig } from '../../../../../../lib/config';
import { getFileCaller, isPositiveIntegerId, ordersApiFileHeaders } from '../../../../../../lib/file-access';

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

/**
 * Opens one uploaded file in the browser. MinIO is bound to 127.0.0.1 on the VM, so instead of
 * a presigned link this streams the bytes from orders-api, which decides access (staff, the
 * owning customer, or this order's upload-credential cookie).
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const { id, fileId } = await params;
  if (!isPositiveIntegerId(id) || !isPositiveIntegerId(fileId)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const config = loadConfig();
  let upstream: Response;
  try {
    upstream = await fetch(new URL(`/api/orders/${id}/files/${fileId}/content`, config.ORDERS_API_URL), {
      headers: ordersApiFileHeaders(await getFileCaller()),
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
