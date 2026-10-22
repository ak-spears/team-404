'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BASE_PATH } from '../lib/base-path';
import type { StaffMember } from './OrderAssignmentTable';

export function StaffDirectory({
  staffMembers,
  currentUserId,
}: {
  staffMembers: StaffMember[];
  currentUserId: number;
}) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function removeStaffMember(staff: StaffMember): Promise<void> {
    const confirmed = window.confirm(
      `Remove ${staff.username} from staff? Their staff access will be revoked and their assigned orders will become unassigned. Their account and order history will remain.`,
    );
    if (!confirmed) return;

    setRemovingId(staff.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`${BASE_PATH}/api/admin/staff/${staff.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Staff removal failed');
      setMessage(`${staff.username} no longer has staff access. Their orders are unassigned.`);
      router.refresh();
    } catch {
      setError(`Could not remove ${staff.username}. Please try again.`);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {staffMembers.length === 0 ? (
        <p className="muted">No staff accounts registered.</p>
      ) : (
        <ul className="staff-directory">
          {staffMembers.map((staff) => (
            <li key={staff.id}>
              <span>{staff.username}</span>
              {staff.id === currentUserId ? (
                <span className="muted">Current admin</span>
              ) : (
                <button
                  className="staff-remove-button"
                  type="button"
                  disabled={removingId === staff.id}
                  onClick={() => void removeStaffMember(staff)}
                >
                  {removingId === staff.id ? 'Removing…' : 'Remove access'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
