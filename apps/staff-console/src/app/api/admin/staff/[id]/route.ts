import { NextResponse } from 'next/server';
import { callOrdersApi } from '../../../../../lib/internal-api';
import { getStaffSession, hasAdminSession } from '../../../../../lib/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasAdminSession())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  if (!/^\d+$/.test(id) || Number(id) <= 0) {
    return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 });
  }

  const result = await callOrdersApi({
    method: 'DELETE',
    path: `/api/staff/${id}`,
    role: session.role,
    userId: String(session.userId),
  });
  return NextResponse.json(result.body, { status: result.status });
}
