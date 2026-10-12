import { redirect } from 'next/navigation';
import type { Order } from '@crimson-copies/shared';
import { KanbanBoard } from '../../components/KanbanBoard';
import type { StaffMember } from '../../components/OrderAssignmentTable';
import { BASE_PATH } from '../../lib/base-path';
import { callOrdersApi } from '../../lib/internal-api';
import { getStaffSession } from '../../lib/session';

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  const session = await getStaffSession();
  if (!session) redirect('/login?next=/board');

  const request = {
    method: 'GET' as const,
    role: session.role,
    userId: String(session.userId),
  };
  const [ordersResult, staffResult] = await Promise.all([
    callOrdersApi<Order[]>({ ...request, path: '/api/orders' }),
    callOrdersApi<StaffMember[]>({ ...request, path: '/api/staff' }),
  ]);
  const orders = Array.isArray(ordersResult.body) ? ordersResult.body : [];
  const staffMembers =
    staffResult.status === 200 && Array.isArray(staffResult.body) ? staffResult.body : [];

  return (
    <div className="board-page">
      <section className="board-masthead">
        <p className="board-eyebrow">Crimson Copies · Staff workspace</p>
        <h1>Order board</h1>
        <p>Track every print job from submission to pickup.</p>
      </section>
      {staffResult.status !== 200 && <p className="error">Unable to load staff accounts.</p>}
      <KanbanBoard initialOrders={orders} staffMembers={staffMembers} basePath={BASE_PATH} />
    </div>
  );
}
