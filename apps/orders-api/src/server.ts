import 'dotenv/config';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);
  const app = buildApp({ config, db, pool });

  try {
    // orders-api is internal-only, bound to a non-public listener -- HOST defaults to
    // 127.0.0.1 (config.ts), never the public reverse proxy.
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
