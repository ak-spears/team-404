import { NextResponse } from 'next/server';
import { loadConfig } from '../../../../../lib/config';
import { getFileCaller, isPositiveIntegerId, ordersApiFileHeaders } from '../../../../../lib/file-access';
import { listOrderFiles } from '../../../../../lib/order-files-server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** BFF for `GET /api/orders/:id/files` -- what the customer has uploaded so far. */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  console.log('GET /api/orders/:id/files: request received');

  const { id } = await params;
  if (!isPositiveIntegerId(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const result = await listOrderFiles(Number(id), await getFileCaller());
  if (!result.ok) {
    console.error('GET /api/orders/:id/files: request completed', { orderId: id, status: result.status });
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  console.log('GET /api/orders/:id/files: request completed', {
    orderId: id,
    fileCount: result.files.length,
  });
  return NextResponse.json({ files: result.files }, { status: 200 });
}

/**
 * BFF for the customer file upload. callOrdersApi() is JSON-only, so this forwards the raw
 * multipart body itself -- and forwards it as a STREAM (`duplex: 'half'`) rather than reading
 * it into a Buffer first, so a 50MB print file never has to sit in this process's memory. The
 * browser never sees INTERNAL_API_KEY, MinIO, or the upload credential (an HttpOnly cookie).
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  console.log('POST /api/orders/:id/files: request received');

  const { id } = await params;
  if (!isPositiveIntegerId(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const contentType = request.headers.get('content-type');
  if (!contentType?.startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'multipart_required' }, { status: 415 });
  }

  const config = loadConfig();
  const headers = ordersApiFileHeaders(await getFileCaller());
  // Passed through verbatim: the multipart boundary is part of this value.
  headers['Content-Type'] = contentType;

  let status: number;
  let body: unknown;
  try {
    const upstream = await fetch(new URL(`/api/orders/${id}/files`, config.ORDERS_API_URL), {
      method: 'POST',
      headers,
      body: request.body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    status = upstream.status;
    body = await upstream.json().catch(() => undefined);
  } catch (err) {
    console.error('POST /api/orders/:id/files: upstream call failed', {
      orderId: id,
      errorName: err instanceof Error ? err.name : 'UnknownError',
    });
    return NextResponse.json({ error: 'upload_failed' }, { status: 502 });
  }

  console.log('POST /api/orders/:id/files: request completed', { orderId: id, status });
  return NextResponse.json(body ?? { error: 'upload_failed' }, { status });
}
