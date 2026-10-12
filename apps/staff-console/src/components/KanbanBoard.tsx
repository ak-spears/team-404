'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ORDER_STATUSES,
  isValidStatusTransition,
  type Order,
  type OrderStatus,
} from '@crimson-copies/shared';
import type { StaffMember } from './OrderAssignmentTable';

const label = (status: string) => status.replace(/_/g, ' ');

export function KanbanBoard({
  initialOrders,
  staffMembers,
  basePath,
}: {
  initialOrders: Order[];
  staffMembers: StaffMember[];
  basePath: string;
}) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staffFilter, setStaffFilter] = useState<string>('all');

  const dragging = orders.find((o) => o.id === draggingId);

  const filteredOrders = orders.filter((order) => {
    if (staffFilter === 'all') return true;
    if (staffFilter === 'unassigned') return !order.assignedTo;

    return String(order.assignedTo) === staffFilter;
  });

  async function moveOrder(orderId: number, to: OrderStatus): Promise<void> {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status === to) return;
    if (!isValidStatusTransition(order.status, to)) {
      setError(`Order #${orderId} can't move from ${label(order.status)} to ${label(to)}.`);
      return;
    }

    setError(null);
    const previous = orders;
    setOrders(orders.map((o) => (o.id === orderId ? { ...o, status: to } : o)));

    try {
      // Plain fetch() is NOT basePath-aware in Next, so prefix explicitly.
      const res = await fetch(`${basePath}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to }),
      });
      if (!res.ok) throw new Error('update failed');
    } catch {
      setOrders(previous);
      setError(`Couldn't update order #${orderId}. Please try again.`);
    }
  }

  return (
    <>
      {error && <p className="error">{error}</p>}
      <div className="board-filters">
        <div className="board-filter-copy">
          <span className="board-filter-kicker">View work</span>
          <label htmlFor="staff-filter">Assigned staff</label>
        </div>
        <select
          id="staff-filter"
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
        >
          <option value="all">All Orders</option>
          <option value="unassigned">Unassigned</option>

          {staffMembers.map((staff) => (
            <option key={staff.id} value={staff.id}>
              {staff.username}
            </option>
          ))}
        </select>
      </div>

      <div className="kanban">
        {ORDER_STATUSES.map((status) => {
          const columnOrders = filteredOrders.filter((o) => o.status === status);
          const canDrop = dragging ? isValidStatusTransition(dragging.status, status) : false;

          return (
            <section
              key={status}
              data-status={status}
              className={`kanban-column${canDrop ? ' drop-ok' : ''}`}
              onDragOver={(e) => {
                if (canDrop) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingId !== null) void moveOrder(draggingId, status);
                setDraggingId(null);
              }}
            >
              <header className="kanban-column-header">
                <h2>{label(status)}</h2>
                <span className="kanban-count">{columnOrders.length}</span>
              </header>

              {columnOrders.length === 0 && <p className="kanban-empty">Nothing here yet</p>}

              {columnOrders.map((order) => {
                const nextStatuses = ORDER_STATUSES.filter((s) =>
                  isValidStatusTransition(order.status, s),
                );

                const assigneeName =
                  staffMembers.find((staff) => staff.id === order.assignedTo)?.username ??
                  'Unassigned';

                return (
                  <article
                    key={order.id}
                    className={`kanban-card${draggingId === order.id ? ' is-dragging' : ''}`}
                    draggable
                    onDragStart={() => setDraggingId(order.id)}
                    onDragEnd={() => setDraggingId(null)}
                  >
                    <Link href={`/orders/${order.id}`}>#{order.id}</Link>
                    <div>{order.serviceType}</div>
                    <div className="muted">Assigned: {assigneeName}</div>
                    <div className="muted">
                      Qty {order.quantity} · {new Date(order.createdAt).toLocaleDateString()}
                    </div>
                    {nextStatuses.length > 0 && (
                      <select
                        aria-label={`Move order ${order.id}`}
                        value=""
                        onChange={(e) => void moveOrder(order.id, e.target.value as OrderStatus)}
                      >
                        <option value="">Move to…</option>
                        {nextStatuses.map((s) => (
                          <option key={s} value={s}>
                            {label(s)}
                          </option>
                        ))}
                      </select>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
}
