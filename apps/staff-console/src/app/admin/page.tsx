import { redirect } from 'next/navigation';
import type { Order } from '@crimson-copies/shared';
import { callOrdersApi } from '../../lib/internal-api';
import { BASE_PATH } from '../../lib/base-path';
import { getStaffSession, hasAdminSession } from '../../lib/session';
import { OrderAssignmentTable, type StaffMember } from '../../components/OrderAssignmentTable';

export default async function AdminPage() {
  const session = await getStaffSession();

  if (!session) {
    redirect('/login?next=/admin');
  }

  if (!(await hasAdminSession())) {
    return (
      <>
        <h1>Admin access</h1>
        <p>Are you an admin?</p>
        <form action={`${BASE_PATH}/api/admin/login`} method="post">
          <button type="submit">Yes, continue</button>
        </form>
        <p role="note">
          Demo purposes only: this confirmation is not real admin authentication. Use proper admin
          roles before production.
        </p>
      </>
    );
  }

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
      <h1>Order Assignments</h1>
      <p role="note">
        Demo purposes only: admin access uses a confirmation button, not real admin authentication.
        Use proper admin roles before production.
      </p>
      {staffResult.status !== 200 && <p className="error">Unable to load staff accounts.</p>}
      <OrderAssignmentTable
        initialOrders={orders}
        staffMembers={staffMembers}
        basePath={BASE_PATH}
      />
    </>
  );
}
