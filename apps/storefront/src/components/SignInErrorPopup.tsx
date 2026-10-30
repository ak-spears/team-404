'use client';

import { useEffect, useRef } from 'react';

/**
 * Pops up a sign-in error, then sends the user back to sign in. Rendered by the home page when
 * the middleware signed someone out for using a non-UA email.
 */
export function SignInErrorPopup({ message, redirectTo }: { message: string; redirectTo: string }) {
  // React's dev-mode double effect would otherwise show the alert twice.
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    window.alert(message);
    window.location.replace(redirectTo);
  }, [message, redirectTo]);

  return null;
}
