import type { OrderStatus } from './enums.js';

/**
 * Order lifecycle graph. `cancelled` is reachable from every non-terminal state; `completed` and
 * `cancelled` are terminal.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  // files_received is reachable directly: orders are created as `submitted`, so a customer
  // who uploads right after ordering never passes through files_pending.
  submitted: ['files_pending', 'files_received', 'cancelled'],
  files_pending: ['files_received', 'cancelled'],
  files_received: ['in_production', 'cancelled'],
  in_production: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function isValidStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}
