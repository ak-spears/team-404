import { ORDER_STATUS_LABELS, type Order } from '@crimson-copies/shared';
import { orderNumber } from '../lib/orders';
import { formatPrice, SERVICE_DETAILS } from '../lib/services';
import { StepMeter } from './StepMeter';

const placedOn = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export function OrderRow({ order }: { order: Order }) {
  const price = order.priceCents === null ? 'Quote pending' : formatPrice(order.priceCents);
  return (
    <a href={`/orders/${order.id}`} className="order-row" data-status={order.status}>
      <span className="order-row-id">#{orderNumber(order)}</span>
      <span className="order-row-main">
        <strong>{SERVICE_DETAILS[order.serviceType].title}</strong>
        <span>
          Qty {order.quantity} &middot; {price} &middot; Placed{' '}
          {placedOn.format(new Date(order.createdAt))}
        </span>
      </span>
      <StepMeter status={order.status} />
      <span className="badge" data-status={order.status}>
        {ORDER_STATUS_LABELS[order.status]}
      </span>
    </a>
  );
}
