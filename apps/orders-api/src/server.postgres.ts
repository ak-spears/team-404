import 'dotenv/config';
import { buildApp } from './app.postgres.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.postgres.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);
  const app = buildApp({ config, db, pool });

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();