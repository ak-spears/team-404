import { NextResponse } from 'next/server';
import { BASE_PATH } from '../../../../../lib/base-path';
import { callOrdersApi } from '../../../../../lib/internal-api';
import { getStaffSession } from '../../../../../lib/session';

interface OrderFileRecord {
  id: number;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
}

interface OrderFileLink {
  id: number;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
  url: string;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * BFF for the staff-console file list -- calls orders-api's `GET /api/orders/:id/files` and
 * links each file to this app's own download route (./[fileId]/route.ts). MinIO listens on
 * 127.0.0.1 only, so a presigned MinIO link would be unreachable from a staff browser.
 * Independently re-checks the session (see the status route's comment for why).
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  console.log('GET /api/orders/:id/files: request received');

  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!/^[1-9]\d{0,15}$/.test(id)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const result = await callOrdersApi<OrderFileRecord[]>({
    method: 'GET',
    path: `/api/orders/${id}/files`,
    role: session.role,
    userId: String(session.userId),
  });

  if (result.status !== 200 || !Array.isArray(result.body)) {
    console.error('GET /api/orders/:id/files: request completed', { orderId: id, status: result.status });
    return NextResponse.json(result.body ?? { error: 'files_unavailable' }, {
      status: result.status === 200 ? 502 : result.status,
    });
  }

  // Client-side links are not basePath-aware, so the /staff prefix is spelled out here.
  const files: OrderFileLink[] = result.body.map((file) => ({
    id: file.id,
    originalFilename: file.originalFilename,
    sizeBytes: file.sizeBytes,
    uploadedAt: file.uploadedAt,
    url: `${BASE_PATH}/api/orders/${id}/files/${file.id}`,
  }));

  console.log('GET /api/orders/:id/files: request completed', { orderId: id, fileCount: files.length });
  return NextResponse.json({ files }, { status: 200 });
}
