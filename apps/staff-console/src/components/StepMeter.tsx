import { ORDER_PROGRESS_STATUSES, type OrderStatus } from '@crimson-copies/shared';

/** Compact segmented bar for an order's place in the pipeline. Renders nothing for cancelled
 * orders (the badge already says so). */
export function StepMeter({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') return null;
  const current = ORDER_PROGRESS_STATUSES.indexOf(status);

  return (
    <span className="step-meter" aria-hidden>
      {ORDER_PROGRESS_STATUSES.map((step, index) => (
        <span key={step} data-on={index <= current || undefined} />
      ))}
    </span>
  );
}
