import type { Order, OrderStatus } from '@crimson-copies/shared';

const DONE: readonly OrderStatus[] = ['completed', 'cancelled'];

/**
 * What a customer calls an order: their own running count ("#4" for their 4th order), not the
 * global id, which would make a 4th order read as "#25". Guest orders have no count and fall
 * back to the id. URLs and upload credentials keep using the id.
 */
export function orderNumber(order: Pick<Order, 'id' | 'customerOrderNumber'>): number {
  return order.customerOrderNumber ?? order.id;
}

/** Ready-for-pickup first (that's what a customer comes back for), then open, then done. */
function rank(order: Order): number {
  if (order.status === 'ready_for_pickup') return 0;
  return DONE.includes(order.status) ? 2 : 1;
}

/** Ranked, newest first within each rank. */
export function sortOrders(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));
}

export const ORDER_VIEWS = {
  all: { label: 'All', empty: "You haven't placed any orders yet.", match: () => true },
  ready: {
    label: 'Ready for pickup',
    empty: 'Nothing is waiting for pickup right now.',
    match: (order: Order) => rank(order) === 0,
  },
  active: {
    label: 'In progress',
    empty: 'Nothing in progress right now.',
    match: (order: Order) => rank(order) === 1,
  },
  past: {
    label: 'Past',
    empty: 'Completed and cancelled orders will show up here.',
    match: (order: Order) => rank(order) === 2,
  },
} as const;

export type OrderView = keyof typeof ORDER_VIEWS;

export function isOrderView(value: unknown): value is OrderView {
  return typeof value === 'string' && value in ORDER_VIEWS;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function summarizeOrders(orders: Order[]): string {
  if (orders.length === 0) return "You haven't placed any orders yet.";
  const ready = orders.filter(ORDER_VIEWS.ready.match).length;
  const open = orders.filter(ORDER_VIEWS.active.match).length;
  if (!ready && !open) return "You're all caught up. Nothing in progress right now.";
  const parts = [];
  if (open) parts.push(`${plural(open, 'order')} in progress`);
  if (ready) parts.push(`${ready} ready for pickup`);
  return `You have ${parts.join(' and ')}.`;
}
