import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createDb } from './client.js';
import { users } from './schema.js';

/**
 * Local dev/demo accounts. Not real secrets -- plaintext by design, same as the MySQL/MinIO
 * dev-default credentials already in docker-compose.yml. Never used against a real deploy.
 */
const DEMO_USERS = [
  { username: 'staff', password: 'staffpass123', role: 'staff' as const },
  { username: 'customer', password: 'customerpass123', role: 'customer' as const },
];

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);

  for (const demoUser of DEMO_USERS) {
    const [existing] = await db.select().from(users).where(eq(users.username, demoUser.username)).limit(1);
    if (existing) {
      console.log('seed: user already exists, skipping', { username: demoUser.username });
      continue;
    }

    const passwordHash = await bcrypt.hash(demoUser.password, config.BCRYPT_ROUNDS);
    await db.insert(users).values({
      username: demoUser.username,
      passwordHash,
      role: demoUser.role,
    });
    console.log('seed: user created', { username: demoUser.username, role: demoUser.role });
  }

  await pool.end();
  console.log('Seed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
