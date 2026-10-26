'use client';

import { useState } from 'react';
import { ORDER_STATUS_LABELS, type Order } from '@crimson-copies/shared';
import { SERVICE_TITLES } from '../lib/labels';

export interface StaffMember {
  id: number;
  username: string;
}

export function OrderAssignmentTable({
  initialOrders,
  staffMembers,
  basePath,
}: {
  initialOrders: Order[];
  staffMembers: StaffMember[];
  basePath: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [savingOrderIds, setSavingOrderIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function updateAssignment(orderId: number, value: string): Promise<void> {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;

    const assignedTo = value === '' ? null : Number(value);
    const previousAssignedTo = order.assignedTo;
    setError(null);
    setOrders((current) =>
      current.map((item) => (item.id === orderId ? { ...item, assignedTo } : item)),
    );
    setSavingOrderIds((current) => [...current, orderId]);

    try {
      const response = await fetch(`${basePath}/api/orders/${orderId}/assignment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedTo }),
      });
      if (!response.ok) throw new Error('Assignment update failed');
    } catch {
      setOrders((current) =>
        current.map((item) =>
          item.id === orderId ? { ...item, assignedTo: previousAssignedTo } : item,
        ),
      );
      setError(`Couldn't update the assignment for order #${orderId}. Please try again.`);
    } finally {
      setSavingOrderIds((current) => current.filter((id) => id !== orderId));
    }
  }

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Service</th>
              <th>Status</th>
              <th>Assigned To</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>#{order.id}</td>
                <td>{SERVICE_TITLES[order.serviceType]}</td>
                <td>
                  <span className="badge" data-status={order.status}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                </td>
                <td>
                  <select
                    aria-label={`Assign order ${order.id}`}
                    value={String(order.assignedTo ?? '')}
                    disabled={savingOrderIds.includes(order.id) || staffMembers.length === 0}
                    onChange={(event) => void updateAssignment(order.id, event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {staffMembers.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.username}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {staffMembers.length === 0 && <p>No staff accounts are available for assignment.</p>}
    </>
  );
}
