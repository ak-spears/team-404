import { NextResponse } from 'next/server';
import { staffRegistrationInputSchema } from '@crimson-copies/shared';
import { callOrdersApi } from '../../../../lib/internal-api';
import { getStaffSession, hasAdminSession } from '../../../../lib/session';

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasAdminSession())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => undefined);
  const parsed = staffRegistrationInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await callOrdersApi({
    method: 'POST',
    path: '/api/staff',
    role: session.role,
    userId: String(session.userId),
    body: parsed.data,
  });
  return NextResponse.json(result.body, { status: result.status });
}
