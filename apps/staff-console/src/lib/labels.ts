import type { Order, OrderStatus, PaymentMethod, ServiceType } from '@crimson-copies/shared';

/** Display names -- same wording the storefront shows customers. */
export const SERVICE_TITLES: Record<ServiceType, string> = {
  department_job: 'Department job',
  poster: 'Poster',
  resume_portfolio: 'Resume & portfolio',
  class_assignment: 'Class assignment',
  personal_printing: 'Personal printing',
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  bama_cash: 'Bama Cash',
  card: 'Card',
  cash: 'Cash',
};

export function formatPrice(cents: number | null): string {
  return cents === null ? 'Quote pending' : `$${(cents / 100).toFixed(2)}`;
}

const DONE: readonly OrderStatus[] = ['completed', 'cancelled'];

export const isOpen = (order: Order) => !DONE.includes(order.status);

/** Work-queue order: open jobs oldest first (first in, first out), finished ones after,
 * newest first. */
export function sortQueue(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => {
    const openDiff = Number(isOpen(b)) - Number(isOpen(a));
    if (openDiff) return openDiff;
    return isOpen(a)
      ? a.createdAt.localeCompare(b.createdAt)
      : b.createdAt.localeCompare(a.createdAt);
  });
}

/** "jdoe@crimson.ua.edu" -> "Jdoe" for the account button. */
export function displayName(username: string): string {
  const first = username.split('@')[0]?.split(/[\s._-]/)[0] || username;
  return first.charAt(0).toUpperCase() + first.slice(1);
}
