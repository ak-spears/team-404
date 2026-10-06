'use client';

import { useTransition } from 'react';

export function ClaimOrderButton({ orderId, onClaimed }: { orderId: number; onClaimed?: () => void }) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      // Placeholder: replace with your actual API call
      await fetch(`/api/orders/${orderId}/assign`, { method: 'POST' });
      // Optionally trigger parent refresh
      if (onClaimed) onClaimed();
    });
  };

  return (
    <button onClick={handleClick} disabled={isPending} style={{ marginLeft: 8 }}>
      {isPending ? 'Claiming…' : 'Pick up'}
    </button>
  );
}
