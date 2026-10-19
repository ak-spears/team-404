import Link from 'next/link';
import { ORDER_STATUS_LABELS, type Order } from '@crimson-copies/shared';
import { formatPrice, SERVICE_TITLES } from '../lib/labels';
import { StepMeter } from './StepMeter';

const placedOn = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** One order in a staff list. `assignee` is the staff username, or omitted to hide it. */
export function OrderRow({ order, assignee }: { order: Order; assignee?: string | null }) {
  return (
    <Link href={`/orders/${order.id}`} className="order-row" data-status={order.status}>
      <span className="order-row-id">#{order.id}</span>
      <span className="order-row-main">
        <strong>{SERVICE_TITLES[order.serviceType]}</strong>
        <span>
          Qty {order.quantity} &middot; {formatPrice(order.priceCents)} &middot; Placed{' '}
          {placedOn.format(new Date(order.createdAt))}
        </span>
      </span>
      {assignee !== undefined && (
        <span className="order-row-assignee" data-unassigned={assignee ? undefined : ''}>
          {assignee ?? 'Unassigned'}
        </span>
      )}
      <StepMeter status={order.status} />
      <span className="badge" data-status={order.status}>
        {ORDER_STATUS_LABELS[order.status]}
      </span>
    </Link>
  );
}
