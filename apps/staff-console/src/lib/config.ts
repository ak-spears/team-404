import { z } from 'zod';

// Hosted (Caddy fronts both apps on one origin): "/" reaches the storefront. Local dev runs
// the apps on separate ports with no proxy, so a relative path can't cross over -- fall back
// to the storefront's dev port. Override STOREFRONT_URL for any non-standard setup.
const DEFAULT_STOREFRONT_URL =
  process.env.NODE_ENV === 'production' ? '/' : 'http://localhost:3000/';
const DEFAULT_APP_BASE_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://team-404.capstone.uamishub.com'
    : 'http://localhost:3001';

/** Server-only environment -- nothing here is ever exposed to a Client Component bundle. */
const envSchema = z.object({
  ORDERS_API_URL: z.string().default('http://127.0.0.1:4000'),
  STAFF_CONSOLE_ORIGIN: z
    .string()
    .url()
    .default(
      process.env.NODE_ENV === 'production'
        ? 'https://team-404.capstone.uamishub.com'
        : 'http://localhost:3001',
    ),
  INTERNAL_API_KEY: z.string().min(1, 'INTERNAL_API_KEY is required'),
  //GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  //APP_BASE_URL: z.string().url().default(DEFAULT_APP_BASE_URL),
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
  // A presigned URL is signed for the host the STAFF BROWSER will request, not the address
  // staff-console reaches MinIO on: SigV4 covers the Host header, so a link signed for
  // 127.0.0.1 cannot be rewritten to the public hostname afterwards -- the signature breaks.
  // On the VM these name the team's public host, where Caddy proxies /<bucket>/* to MinIO
  // (deploy/vm/Caddyfile). Unset locally, where the browser reaches MinIO directly.
  MINIO_PUBLIC_ENDPOINT: z.string().optional(),
  MINIO_PUBLIC_PORT: z.coerce.number().int().optional(),
  MINIO_PUBLIC_USE_SSL: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
