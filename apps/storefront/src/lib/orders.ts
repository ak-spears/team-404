import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from '@crimson-copies/shared';
import { formatPrice, SERVICE_DETAILS } from './services';

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

const SEARCH_DATE = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });

/**
 * The text one order is matched against. Deliberately covers the things actually printed on
 * an OrderRow -- order number, service, status, price, date -- so anything a customer can
 * read off the list is also something they can type into the box. `specNotes` is included
 * too: it's where "24x36 matte for the poster session" lives, and that phrasing is often the
 * only thing a customer remembers about an order months later.
 *
 * Fields are joined with a separator no query can contain, so a term can't match by
 * straddling two of them (e.g. "poster submitted" never matches as one run of text).
 */
function searchableText(order: Order): string {
  const parts: string[] = [
    `#${orderNumber(order)}`,
    String(orderNumber(order)),
    SERVICE_DETAILS[order.serviceType].title,
    // The raw enum both ways, so "resume_portfolio" pasted from a URL or a staff email hits,
    // and so does "resume portfolio" typed out. The underscore form has to be indexed
    // verbatim: a query is only ever split on whitespace, so "resume_portfolio" stays one
    // term and would never match the spaced form on its own.
    order.serviceType,
    order.serviceType.replace(/_/g, ' '),
    ORDER_STATUS_LABELS[order.status],
    order.specNotes ?? '',
    SEARCH_DATE.format(new Date(order.createdAt)),
  ];
  if (order.priceCents !== null) {
    // Both "12.50" and "$12.50" -- a customer scanning a receipt types it either way.
    parts.push(formatPrice(order.priceCents), (order.priceCents / 100).toFixed(2));
  } else {
    parts.push('quote pending');
  }
  return parts.join(' \u0000 ').toLowerCase();
}

/** Trimmed, collapsed search text; '' when the param is absent or blank. */
export function normalizeQuery(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 100);
}

/**
 * Every whitespace-separated term must match somewhere (AND), so adding a word narrows the
 * list the way a customer expects -- "poster ready" finds posters waiting for pickup, not
 * every poster plus every ready order. The order number is indexed both bare and with a
 * leading '#', so "4" and "#4" both hit.
 */
export function searchOrders(orders: Order[], query: string): Order[] {
  if (!query) return orders;
  const terms = query.toLowerCase().split(' ').filter(Boolean);
  if (terms.length === 0) return orders;
  return orders.filter((order) => {
    const haystack = searchableText(order);
    return terms.every((term) => haystack.includes(term));
  });
}
