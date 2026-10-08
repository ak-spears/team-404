import { ORDER_STATUSES, type OrderStatus } from './enums.js';

/** Human-readable label for each status, e.g. for badges and progress trackers. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  submitted: 'Submitted',
  files_pending: 'Files Pending',
  files_received: 'Files Received',
  in_production: 'In Production',
  ready_for_pickup: 'Ready for Pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * The non-cancelled statuses in pipeline order -- `ORDER_STATUSES` minus `cancelled`, which is
 * an exceptional exit reachable from any of these rather than a pipeline stage. Drives any UI
 * that shows progress through the normal order lifecycle (e.g. a step tracker).
 */
export const ORDER_PROGRESS_STATUSES: readonly Exclude<OrderStatus, 'cancelled'>[] = ORDER_STATUSES.filter(
  (status): status is Exclude<OrderStatus, 'cancelled'> => status !== 'cancelled',
);

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
