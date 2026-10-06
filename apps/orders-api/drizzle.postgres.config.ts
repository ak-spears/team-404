import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.postgres.ts',
  out: './drizzle-postgres',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/crimson_copies',
  },
});
