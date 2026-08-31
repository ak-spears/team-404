'use client';

import { useState, type FormEvent } from 'react';
import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from '@crimson-copies/shared';

/** Advance an order's status. Posts to this app's own PATCH BFF route (staff-only). */
export function StatusUpdateForm({
  orderId,
  currentStatus,
}: {
  orderId: number;
  currentStatus: OrderStatus;
}) {
  const nextOptions = ORDER_STATUS_TRANSITIONS[currentStatus];
  const [status, setStatus] = useState<OrderStatus | ''>(nextOptions[0] ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<OrderStatus | null>(null);

  if (nextOptions.length === 0) {
    return <p className="muted">Order #{orderId} is in a terminal state ({currentStatus}).</p>;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!status) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        setError('Could not update the order status.');
        return;
      }
      setUpdated(status);
    } catch {
      setError('Network error -- please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (updated) {
    return <p>Order #{orderId} is now &ldquo;{updated}&rdquo;. Refresh to see the full record.</p>;
  }

  const optionElements = [];
  for (const option of nextOptions) {
    optionElements.push(
      <option key={option} value={option}>
        {option}
      </option>,
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Advance to
        <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
          {optionElements}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Updating...' : 'Update status'}
      </button>
    </form>
  );
}
