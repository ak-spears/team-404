'use client';

import { useRouter, usePathname } from 'next/navigation';

const CATEGORIES = [
  { label: 'All', value: '' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Files Pending', value: 'files_pending' },
  { label: 'Files Received', value: 'files_received' },
  { label: 'In Production', value: 'in_production' },
  { label: 'Ready for Pickup', value: 'ready_for_pickup' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' }
];


export function OrderStatusTabs({ currentStatus }: { currentStatus?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="order-status-tabs">
      {CATEGORIES.map((cat) => (
        <button
          key={cat.value}
          className={cat.value === (currentStatus ?? '') ? 'active' : ''}
          onClick={() => {
            const queryParams = cat.value ? `?status=${cat.value}` : '';
            router.push(`${pathname}${queryParams}`);
          }}
          type="button"
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}


