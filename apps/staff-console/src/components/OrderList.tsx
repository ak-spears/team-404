import type { ReactNode } from 'react';
import type { Order } from '@crimson-copies/shared';
import type { StaffMember } from './OrderAssignmentTable';
import { OrderRow } from './OrderRow';

interface OrderListProps {
  orders: Order[];
  /** Pass to show each order's assignee; omit to hide the column. */
  staff?: StaffMember[];
  empty: ReactNode;
}

export function OrderList({ orders, staff, empty }: OrderListProps) {
  if (orders.length === 0) return <div className="order-empty">{empty}</div>;

  const assigneeOf = (order: Order) =>
    staff && (staff.find((member) => member.id === order.assignedTo)?.username ?? null);

  return (
    <ul className="order-list">
      {orders.map((order) => (
        <li key={order.id}>
          <OrderRow order={order} assignee={assigneeOf(order)} />
        </li>
      ))}
    </ul>
  );
}
