import { NextResponse } from 'next/server';
import { loadOrderFiles } from '../../../../../lib/order-files';
import { getStaffSession } from '../../../../../lib/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * BFF for the staff-console file list. The fetch-and-link work lives in lib/order-files.ts so
 * the order page can do the same thing server-side; this route is what the client list
 * refreshes from. Independently re-checks the session (see the status route's comment for why).
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

  const result = await loadOrderFiles(id, { role: session.role, userId: session.userId });

  if (!result.ok) {
    console.error('GET /api/orders/:id/files: request completed', {
      orderId: id,
      status: result.status,
    });
    return NextResponse.json({ error: 'files_unavailable' }, { status: result.status });
  }

  console.log('GET /api/orders/:id/files: request completed', {
    orderId: id,
    fileCount: result.files.length,
  });
  return NextResponse.json({ files: result.files }, { status: 200 });
}
