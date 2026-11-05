'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  isValidStatusTransition,
  type Order,
  type OrderStatus,
} from '@crimson-copies/shared';
import { SERVICE_TITLES } from '../lib/labels';
import type { StaffMember } from './OrderAssignmentTable';

const label = (status: OrderStatus) => ORDER_STATUS_LABELS[status];
const placedOn = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

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
  const [savingOrderIds, setSavingOrderIds] = useState<number[]>([]);
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
    const previousStatus = order.status;
    setOrders((current) => current.map((o) => (o.id === orderId ? { ...o, status: to } : o)));

    try {
      // Plain fetch() is NOT basePath-aware in Next, so prefix explicitly.
      const res = await fetch(`${basePath}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to }),
      });
      if (!res.ok) throw new Error('update failed');
    } catch {
      // Only this order's status: an assignment saved in the meantime has to survive the rollback.
      setOrders((current) =>
        current.map((o) => (o.id === orderId ? { ...o, status: previousStatus } : o)),
      );
      setError(`Couldn't update order #${orderId}. Please try again.`);
    }
  }

  async function assignOrder(orderId: number, value: string): Promise<void> {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const assignedTo = value === '' ? null : Number(value);
    const previousAssignedTo = order.assignedTo;
    setError(null);
    setOrders((current) => current.map((o) => (o.id === orderId ? { ...o, assignedTo } : o)));
    setSavingOrderIds((current) => [...current, orderId]);

    try {
      const res = await fetch(`${basePath}/api/orders/${orderId}/assignment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedTo }),
      });
      if (!res.ok) throw new Error('assignment failed');
    } catch {
      setOrders((current) =>
        current.map((o) => (o.id === orderId ? { ...o, assignedTo: previousAssignedTo } : o)),
      );
      setError(`Couldn't update the assignment for order #${orderId}. Please try again.`);
    } finally {
      setSavingOrderIds((current) => current.filter((id) => id !== orderId));
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
          <option value="all">All orders</option>
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

                return (
                  <article
                    key={order.id}
                    className={`kanban-card${draggingId === order.id ? ' is-dragging' : ''}`}
                    draggable
                    onDragStart={() => setDraggingId(order.id)}
                    onDragEnd={() => setDraggingId(null)}
                  >
                    <div className="kanban-card-head">
                      <Link href={`/orders/${order.id}`}>#{order.id}</Link>
                      <select
                        aria-label={`Assign order ${order.id}`}
                        value={String(order.assignedTo ?? '')}
                        disabled={savingOrderIds.includes(order.id) || staffMembers.length === 0}
                        onChange={(e) => void assignOrder(order.id, e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {staffMembers.map((staff) => (
                          <option key={staff.id} value={staff.id}>
                            {staff.username}
                          </option>
                        ))}
                      </select>
                    </div>
                    <strong className="kanban-card-title">
                      {SERVICE_TITLES[order.serviceType]}
                    </strong>
                    <div className="muted">
                      Qty {order.quantity} &middot; {placedOn.format(new Date(order.createdAt))}
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
