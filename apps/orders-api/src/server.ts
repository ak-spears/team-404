import 'dotenv/config';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { ensureBucket } from './lib/storage.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);
  const app = buildApp({ config, db, pool });

  // Deliberately not fatal: order placement doesn't touch MinIO, so a storage outage must not
  // take the whole API down (systemd would then crash-loop it). The upload route surfaces its
  // own error when storage is actually needed.
  try {
    await ensureBucket(config);
  } catch (err) {
    console.error('MinIO bucket check failed -- file upload will not work until it recovers', err);
  }

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
