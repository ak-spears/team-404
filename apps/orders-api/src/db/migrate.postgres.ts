import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { loadConfig } from '../config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const db = drizzle(pool);

  await migrate(db, { migrationsFolder: './drizzle-postgres' });

  await pool.end();
  console.log('Postgres migrations applied.');
}

main().catch((err) => {
  console.error('Postgres migration failed:', err);
  process.exit(1);
});