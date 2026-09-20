import { z } from 'zod';

// Hosted (Caddy fronts both apps on one origin): "/" reaches the storefront. Local dev runs
// the apps on separate ports with no proxy, so a relative path can't cross over -- fall back
// to the storefront's dev port. Override STOREFRONT_URL for any non-standard setup.
const DEFAULT_STOREFRONT_URL =
  process.env.NODE_ENV === 'production' ? '/' : 'http://localhost:3000/';

/** Server-only environment -- nothing here is ever exposed to a Client Component bundle. */
const envSchema = z.object({
  ORDERS_API_URL: z.string().default('http://127.0.0.1:4000'),
  INTERNAL_API_KEY: z.string().min(1, 'INTERNAL_API_KEY is required'),
  // Signs the session cookie (see lib/session.ts). Unique to this app -- never shared with
  // storefront, so a leaked secret for one app can't forge sessions for the other.
  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  // Bare origin (no /staff) -- BASE_PATH is added by hand when building the OAuth redirect URI,
  // same as everywhere else in this app that has to prefix a URL manually (see lib/base-path.ts).
  APP_BASE_URL: z.string().min(1, 'APP_BASE_URL is required'),
  // The main Crimson Copies site: the "Home" header link and the post-logout destination.
  STOREFRONT_URL: z.string().default(DEFAULT_STOREFRONT_URL),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().default(9000),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Defaults match docker-compose.yml's MINIO_ROOT_USER/PASSWORD dev defaults -- override per
  // environment the same way orders-api's INTERNAL_API_KEY is overridden (these aren't required
  // because, unlike INTERNAL_API_KEY, docker-compose.yml already documents the dev default
  // in plaintext; a real deploy still must override them).
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin'),
  MINIO_BUCKET: z.string().default('order-files'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
