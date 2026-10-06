import 'dotenv/config';
import { buildApp } from './app.postgres.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.postgres.js';
import { ensureBucket } from './lib/storage.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);
  const app = buildApp({ config, db, pool });

  // Deliberately not fatal: order placement doesn't touch MinIO, so a storage outage must not
  // take the whole API down. The upload route surfaces its own error when storage is needed.
  try {
    await ensureBucket(config);
  } catch (err) {
    console.error('MinIO bucket check failed -- file upload will not work until it recovers', err);
  }

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();