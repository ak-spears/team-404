import { z } from 'zod';

/** Server-only environment -- nothing here is ever exposed to a Client Component bundle. */
const envSchema = z.object({
  ORDERS_API_URL: z.string().default('http://127.0.0.1:4000'),
  INTERNAL_API_KEY: z.string().min(1, 'INTERNAL_API_KEY is required'),
  // Signs the session cookie (see lib/session.ts). Unique to this app -- never shared with
  // storefront, so a leaked secret for one app can't forge sessions for the other.
  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),
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
