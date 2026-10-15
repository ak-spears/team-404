'use client';

import { usePathname } from 'next/navigation';
import type { ComponentProps } from 'react';

/** Header nav link that marks itself `aria-current="page"` on its own route. */
export function NavLink({ href, ...rest }: ComponentProps<'a'> & { href: string }) {
  const current = usePathname() === href;
  return <a href={href} aria-current={current ? 'page' : undefined} {...rest} />;
}
