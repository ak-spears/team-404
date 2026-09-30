import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import ws from 'ws';
import { loadConfig } from '../config.js';

neonConfig.webSocketConstructor = ws;

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