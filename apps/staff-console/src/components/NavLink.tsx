'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentProps } from 'react';

/** Header nav link that marks itself current. `/` only matches exactly; other links also
 * match their sub-pages. usePathname() is basePath-relative, like href. */
export function NavLink({ href, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  const pathname = usePathname();
  const current = href === '/' ? pathname === '/' : pathname.startsWith(href);
  return <Link href={href} aria-current={current ? 'page' : undefined} {...rest} />;
}
