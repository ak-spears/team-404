import { z } from 'zod';

/** Server-only environment -- nothing here is ever exposed to a Client Component bundle. */
const envSchema = z.object({
  ORDERS_API_URL: z.string().default('http://127.0.0.1:4000'),
  INTERNAL_API_KEY: z.string().min(1, 'INTERNAL_API_KEY is required'),
  // Signs the session cookie (see lib/session.ts). Unique to this app -- never shared with
  // staff-console, so a leaked secret for one app can't forge sessions for the other.
  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),
  // Where the storefront's "Staff sign in" footer link points. On the VM the staff console
  // is a path on the same hostname, so the default relative "/staff" is what Caddy routes.
  // Local dev has no reverse proxy, so set this to http://localhost:3001/staff there.
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
