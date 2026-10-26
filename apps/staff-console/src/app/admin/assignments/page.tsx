import Link from 'next/link';
import type { Order } from '@crimson-copies/shared';
import { OrderAssignmentTable, type StaffMember } from '../../../components/OrderAssignmentTable';
import { BASE_PATH } from '../../../lib/base-path';
import { callOrdersApi } from '../../../lib/internal-api';
import { requireAdminSession } from '../../../lib/admin-session';

export const dynamic = 'force-dynamic';

export default async function AdminAssignmentsPage() {
  const session = await requireAdminSession();
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
    <>
      <Link className="admin-back-link" href="/admin">
        ← Admin home
      </Link>
      <h1>Order Assignments</h1>
      {staffResult.status !== 200 && <p className="error">Unable to load staff accounts.</p>}
      <OrderAssignmentTable
        initialOrders={orders}
        staffMembers={staffMembers}
        basePath={BASE_PATH}
      />
    </>
  );
}
