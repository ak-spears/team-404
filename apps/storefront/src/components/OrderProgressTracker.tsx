import { ORDER_PROGRESS_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from '@crimson-copies/shared';

/**
 * Visual step tracker for an order's position in the normal pipeline. `cancelled` falls outside
 * that pipeline (see packages/shared/src/status-transitions.ts), so it renders as a standalone
 * notice instead of a step.
 */
export function OrderProgressTracker({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') {
    return <p className="order-progress-cancelled">This order was cancelled.</p>;
  }

  const currentIndex = ORDER_PROGRESS_STATUSES.indexOf(status);

  return (
    <ol className="order-progress">
      {ORDER_PROGRESS_STATUSES.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
        return (
          <li key={step} className="order-progress-step" data-state={state}>
            <span className="order-progress-dot" aria-hidden="true" />
            <span className="order-progress-label">{ORDER_STATUS_LABELS[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}
