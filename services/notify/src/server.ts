import 'dotenv/config';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = buildApp({ config });

  try {
    // Internal-only, same non-public listener convention as orders-api.
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
