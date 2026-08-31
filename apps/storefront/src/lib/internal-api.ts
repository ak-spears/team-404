import { loadConfig } from './config';

export type InternalRole = 'customer' | 'staff';

export interface InternalFetchOptions {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  // Omitted for guest requests -- orders-api treats a caller with no role/id as anonymous (see
  // plugins/internal-auth.ts).
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
 * Server-only call to orders-api's internal listener.
 * `INTERNAL_API_KEY` comes from server env (src/lib/config.ts) and is attached here, inside a
 * module that must only ever be imported from a Route Handler or Server Component -- never a
 * 'use client' module, so the key can never end up in a browser-bound bundle.
 */
export async function callOrdersApi<T = unknown>(
  options: InternalFetchOptions,
): Promise<InternalFetchResult<T>> {
  const config = loadConfig();
  const url = new URL(options.path, config.ORDERS_API_URL);
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      if (value !== undefined) url.searchParams.set(key, value);
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
