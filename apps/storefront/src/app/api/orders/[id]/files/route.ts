import { NextResponse } from 'next/server';
import { loadConfig } from '../../../../../lib/config';
import { callOrdersApi } from '../../../../../lib/internal-api';
import { presignFileUrl } from '../../../../../lib/minio';
import { getSession } from '../../../../../lib/session';

interface OrderFileRecord {
  objectKey: string;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** BFF for `GET /api/orders/:id/files` -- what the customer has uploaded so far. */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  console.log('GET /api/orders/:id/files: request received');

  const { id } = await params;
  const session = await getSession();
  const result = await callOrdersApi<OrderFileRecord[]>({
    method: 'GET',
    path: `/api/orders/${id}/files`,
    role: session?.role,
    userId: session ? String(session.userId) : undefined,
  });

  if (result.status !== 200 || !Array.isArray(result.body)) {
    console.error('GET /api/orders/:id/files: request completed', { orderId: id, status: result.status });
    return NextResponse.json(result.body, { status: result.status });
  }

  // A download link is handed out only to a caller entitled to the BYTES, which is a higher
  // bar than reading the list: orders-api lets an unidentified caller read any order (the
  // guest-checkout rule), and order ids are sequential, so presigning for everyone would let
  // anyone enumerate ids and collect strangers' files. A session proves ownership (orders-api
  // 403s a customer reading someone else's order); a guest proves it with the credential
  // their order was created with. Everyone else still sees the file list, without links.
  let mayDownload = session !== null;
  const uploadToken = request.headers.get('x-upload-token');
  if (!mayDownload && uploadToken) {
    const check = await callOrdersApi<{ valid: boolean; orderId?: number }>({
      method: 'POST',
      path: '/internal/upload-credentials/check',
      body: { username: id, password: uploadToken },
    });
    mayDownload = check.status === 200 && check.body?.valid === true;
  }

  // The object key never leaves the server either way.
  const files = await Promise.all(
    result.body.map(async (file) => ({
      originalFilename: file.originalFilename,
      sizeBytes: file.sizeBytes,
      uploadedAt: file.uploadedAt,
      url: mayDownload ? await presignFileUrl(file.objectKey, file.originalFilename) : undefined,
    })),
  );

  console.log('GET /api/orders/:id/files: request completed', {
    orderId: id,
    fileCount: files.length,
    withLinks: mayDownload,
  });
  return NextResponse.json({ files }, { status: 200 });
}

/**
 * BFF for the customer file upload. callOrdersApi() is JSON-only, so this forwards the raw
 * multipart body itself -- and forwards it as a STREAM (`duplex: 'half'`) rather than reading
 * it into a Buffer first, so a 50MB print file never has to sit in this process's memory. The
 * browser still never sees INTERNAL_API_KEY or MinIO.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  console.log('POST /api/orders/:id/files: request received');

  const { id } = await params;
  const contentType = request.headers.get('content-type');
  if (!contentType?.startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'multipart_required' }, { status: 415 });
  }

  const config = loadConfig();
  const session = await getSession();
  const headers: Record<string, string> = {
    'X-Internal-Key': config.INTERNAL_API_KEY,
    // Passed through verbatim: the multipart boundary is part of this value.
    'Content-Type': contentType,
  };
  if (session) {
    headers['X-User-Role'] = session.role;
    headers['X-User-Id'] = String(session.userId);
  }
  // A guest has no session, so the only thing that proves this order is theirs is the upload
  // credential returned once when they placed it (see orders-api's upload route). Forwarded
  // as-is; the storefront never inspects or stores it.
  const uploadToken = request.headers.get('x-upload-token');
  if (uploadToken) {
    headers['X-Upload-Token'] = uploadToken;
  }

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
    console.error('POST /api/orders/:id/files: upstream call failed', { orderId: id, err });
    return NextResponse.json({ error: 'upload_failed' }, { status: 502 });
  }

  console.log('POST /api/orders/:id/files: request completed', { orderId: id, status });
  return NextResponse.json(body ?? { error: 'upload_failed' }, { status });
}
