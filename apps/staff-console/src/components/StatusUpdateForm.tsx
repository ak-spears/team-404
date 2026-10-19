'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TRANSITIONS,
  type OrderStatus,
} from '@crimson-copies/shared';
import { BASE_PATH } from '../lib/base-path';

/** Advance an order's status: one button per allowed next step. Posts to this app's own PATCH
 * BFF route (staff-only), then refreshes the server-rendered page so the band updates. */
export function StatusUpdateForm({
  orderId,
  currentStatus,
}: {
  orderId: number;
  currentStatus: OrderStatus;
}) {
  const router = useRouter();
  const nextOptions = ORDER_STATUS_TRANSITIONS[currentStatus];
  const [pending, setPending] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<OrderStatus | null>(null);

  async function moveTo(status: OrderStatus): Promise<void> {
    if (status === 'cancelled' && !window.confirm(`Cancel order #${orderId}?`)) return;
    setPending(status);
    setError(null);

    try {
      // Client fetch() is not basePath-aware -- prefix so this hits /staff/api/... and not
      // the storefront at the root.
      const response = await fetch(`${BASE_PATH}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        setError('Could not update the order status.');
        return;
      }
      setUpdated(status);
      router.refresh();
    } catch {
      setError('Network error -- please try again.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="status-actions">
      {updated && (
        <p className="success" role="status">
          Moved to {ORDER_STATUS_LABELS[updated]}.
        </p>
      )}

      {nextOptions.length === 0 ? (
        <p className="muted">
          {ORDER_STATUS_LABELS[currentStatus]} is final &mdash; nothing left to do.
        </p>
      ) : (
        <>
          <p className="muted">
            Currently <strong>{ORDER_STATUS_LABELS[currentStatus]}</strong>. Move it to:
          </p>
          {nextOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={option === 'cancelled' ? 'btn btn-danger' : 'btn btn-primary'}
              disabled={pending !== null}
              onClick={() => void moveTo(option)}
            >
              {pending === option
                ? 'Updating...'
                : option === 'cancelled'
                  ? 'Cancel order'
                  : ORDER_STATUS_LABELS[option]}
            </button>
          ))}
        </>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
