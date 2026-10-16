import Link from 'next/link';
import type { StaffMember } from '../../../components/OrderAssignmentTable';
import { StaffDirectory } from '../../../components/StaffDirectory';
import { StaffRegistrationForm } from '../../../components/StaffRegistrationForm';
import { callOrdersApi } from '../../../lib/internal-api';
import { requireAdminSession } from '../../../lib/admin-session';

export const dynamic = 'force-dynamic';

export default async function AdminStaffPage() {
  const session = await requireAdminSession();
  const result = await callOrdersApi<StaffMember[]>({
    method: 'GET',
    path: '/api/staff',
    role: session.role,
    userId: String(session.userId),
  });
  const staffMembers = result.status === 200 && Array.isArray(result.body) ? result.body : [];

  return (
    <>
      <Link className="admin-back-link" href="/admin">
        ← Admin home
      </Link>
      <h1>Staff access</h1>
      <p className="admin-analytics-note">
        Register a UA email for staff access. The person will be linked to the staff role when they
        sign in through Auth0.
      </p>
      <StaffRegistrationForm />
      <section className="admin-analytics-section">
        <h2>Registered staff</h2>
        {result.status !== 200 && <p className="error">Unable to load staff accounts.</p>}
        <p className="muted">
          Removing access changes the account to customer and unassigns its orders. The user and
          order history are retained.
        </p>
        <StaffDirectory staffMembers={staffMembers} currentUserId={session.userId} />
      </section>
    </>
  );
}
