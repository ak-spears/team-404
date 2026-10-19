'use client';

import { useEffect, useRef, useState } from 'react';

interface AccountMenuProps {
  name: string;
  email: string;
  showOrders?: boolean;
  staffConsoleUrl?: string;
}

/** Header account button (initial + first name) with a small menu holding the full email and
 * the session actions. Closes on outside click or Escape. */
export function AccountMenu({ name, email, showOrders, staffConsoleUrl }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="account" ref={ref}>
      <button
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="account-avatar" aria-hidden>
          {name.charAt(0)}
        </span>
        <span className="account-name">{name}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="account-menu" role="menu">
          <p className="account-email">
            <span>Signed in as</span>
            {email}
          </p>
          {showOrders && (
            <a href="/orders" role="menuitem">
              My orders
            </a>
          )}
          {staffConsoleUrl && (
            <a href={staffConsoleUrl} role="menuitem">
              Staff console
            </a>
          )}
          {/* Temporary: restore Auth0 logout once Allowed Logout URLs include the home page */}
          <form action="/logout" method="post">
            <button type="submit" role="menuitem">
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
