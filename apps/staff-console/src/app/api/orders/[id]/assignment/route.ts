import { NextResponse } from 'next/server';
import { orderAssignmentInputSchema } from '@crimson-copies/shared';
import { callOrdersApi } from '../../../../../lib/internal-api';
import { getStaffSession } from '../../../../../lib/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => undefined);
  const parsed = orderAssignmentInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  const result = await callOrdersApi({
    method: 'PATCH',
    path: `/api/orders/${id}/assignment`,
    role: session.role,
    userId: String(session.userId),
    body: parsed.data,
  });

  return NextResponse.json(result.body, { status: result.status });
}
