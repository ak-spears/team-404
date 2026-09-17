import { z } from 'zod';

/** Server-only environment -- nothing here is ever exposed to a Client Component bundle. */
const envSchema = z.object({
  ORDERS_API_URL: z.string().default('http://127.0.0.1:4000'),
  INTERNAL_API_KEY: z.string().min(1, 'INTERNAL_API_KEY is required'),
  // Signs the session cookie (see lib/session.ts). Unique to this app -- never shared with
  // staff-console, so a leaked secret for one app can't forge sessions for the other.
  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  AUTH0_DOMAIN: z.string().min(1, 'AUTH0_DOMAIN is required').optional(),
  AUTH0_CLIENT_ID: z.string().min(1, 'AUTH0_CLIENT_ID is required').optional(),
  AUTH0_CLIENT_SECRET: z.string().min(1, 'AUTH0_CLIENT_SECRET is required').optional(),
  AUTH0_SECRET: z.string().min(1, 'AUTH0_SECRET is required').optional(),
  APP_BASE_URL: z.string().min(1, 'APP_BASE_URL is required'),
  // Where the storefront's "Staff sign in" link points. On the VM the staff console is a path
  // on this same hostname (Caddy routes it), so the default relative "/staff" is correct there.
  // Local dev has no reverse proxy -- set http://localhost:3001/staff .
  STAFF_CONSOLE_URL: z.string().default('/staff'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
