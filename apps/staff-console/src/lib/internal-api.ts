import { loadConfig } from './config';

export type InternalRole = 'customer' | 'staff';

export interface InternalFetchOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  // Omitted for the pre-login credential check, where there's no session yet to derive a role
  // from.
  role?: InternalRole | undefined;
  userId?: string | undefined;
  body?: unknown;
  searchParams?: Record<string, string | undefined>;
}

export interface InternalFetchResult<T = unknown> {
  status: number;
  body: T;
}

/**
 * Server-only call to orders-api's internal listener. `INTERNAL_API_KEY` comes from server env
 * (src/lib/config.ts) and is attached here, inside a module that must only ever be imported
 * from a Route Handler or Server Component -- never a 'use client' module, so the key can
 * never end up in a browser-bound bundle.
 *
 * (Deliberately duplicated from apps/storefront/src/lib/internal-api.ts rather than hoisted
 * into packages/shared -- shared owns zod schemas/pricing/constants and no runtime code, and
 * this module is Next.js-server-only by construction.)
 */
export async function callOrdersApi<T = unknown>(
  options: InternalFetchOptions,
): Promise<InternalFetchResult<T>> {
  const config = loadConfig();
  const url = new URL(options.path, config.ORDERS_API_URL);
  if (options.searchParams) {
    for (const [paramName, paramValue] of Object.entries(options.searchParams)) {
      if (paramValue !== undefined) url.searchParams.set(paramName, paramValue);
    }
  }

  const headers: Record<string, string> = {
    'X-Internal-Key': config.INTERNAL_API_KEY,
  };
  if (options.role) headers['X-User-Role'] = options.role;
  if (options.userId) headers['X-User-Id'] = options.userId;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const body = (await response.json().catch(() => undefined)) as T;
  return { status: response.status, body };
}
