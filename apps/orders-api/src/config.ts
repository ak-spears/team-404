import { z } from 'zod';

const envSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  INTERNAL_API_KEY: z.string().min(1, 'INTERNAL_API_KEY is required'),
  NOTIFY_URL: z.string().default('http://127.0.0.1:4100'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  // Consumed by the uploadInstructions block in routes/orders.ts; nothing listens on the
  // other end yet, so these are display-only for now.
  FILE_INTAKE_HOST: z.string().default('localhost'),
  FILE_INTAKE_PORT: z.coerce.number().int().default(2222),
  // MinIO holds the customer-uploaded order files; MySQL only holds the `order_files` rows
  // that point at them. Defaults match docker-compose.yml's dev values so a fresh clone boots
  // -- a real deploy overrides the credentials the same way it overrides INTERNAL_API_KEY.
  MINIO_ENDPOINT: z.string().default('127.0.0.1'),
  MINIO_PORT: z.coerce.number().int().default(9000),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin'),
  MINIO_BUCKET: z.string().default('order-files'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}