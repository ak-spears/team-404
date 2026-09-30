import { NextResponse } from 'next/server';
import { callOrdersApi } from '../../../../../lib/internal-api';
import { presignFileUrl } from '../../../../../lib/minio';
import { getStaffSession } from '../../../../../lib/session';

interface OrderFileRecord {
  objectKey: string;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
}

interface OrderFileLink {
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
  url: string;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * BFF for the staff-console "view uploaded files via presigned MinIO link" feature -- calls
 * orders-api's `GET /api/orders/:id/files` for the object keys, then presigns each one against
 * MinIO directly. Independently re-checks the session (see the status route's comment for why).
 * Until file upload is wired up, no file ever actually lands in MinIO, so this always returns
 * an empty list.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  console.log('GET /api/orders/:id/files: request received');

  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const result = await callOrdersApi<OrderFileRecord[]>({
    method: 'GET',
    path: `/api/orders/${id}/files`,
    role: session.role,
    userId: String(session.userId),
  });

  if (result.status !== 200 || !Array.isArray(result.body)) {
    console.error('GET /api/orders/:id/files: request completed', { orderId: id, status: result.status });
    return NextResponse.json(result.body, { status: result.status });
  }

  // Disabled once presigned URLs replaced direct-download links -- kept in case we need to fall
  // back to unsigned URLs for a debugging session.
  const USE_UNSIGNED_URLS = false;
  if (USE_UNSIGNED_URLS) {
    console.log('serving unsigned file URLs', { orderId: id });
  }

  const files: OrderFileLink[] = await Promise.all(
    result.body.map(async (file) => ({
      originalFilename: file.originalFilename,
      sizeBytes: file.sizeBytes,
      uploadedAt: file.uploadedAt,
      url: await presignFileUrl(file.objectKey, file.originalFilename),
    })),
  );

  console.log('GET /api/orders/:id/files: request completed', { orderId: id, fileCount: files.length });
  return NextResponse.json({ files }, { status: 200 });
}
