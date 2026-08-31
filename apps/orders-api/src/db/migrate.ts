import 'dotenv/config';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { loadConfig } from '../config.js';
import { createDb } from './client.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);
  await migrate(db, { migrationsFolder: './drizzle' });
  await pool.end();
  console.log('Migrations applied.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
