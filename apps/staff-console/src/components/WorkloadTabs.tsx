'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export function WorkloadTabs({ mineActive }: { mineActive: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // preserve status filter when switching tabs
  const statusParam = searchParams.get('status');

  function goToTab({ mine }: { mine: boolean }) {
    const params = new URLSearchParams();
    if (mine) params.set('mine', '1');
    if (statusParam) params.set('status', statusParam);
    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  return (
    <div className="workload-tabs">
      <button
        className={!mineActive ? 'active' : ''}
        type="button"
        onClick={() => goToTab({ mine: false })}
      >
        All Orders
      </button>
      <button
        className={mineActive ? 'active' : ''}
        type="button"
        onClick={() => goToTab({ mine: true })}
      >
        My Workload
      </button>
    </div>
  );
}
