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
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
