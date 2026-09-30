import { eq } from 'drizzle-orm';
import { createDb } from './client.postgres.js';
import { users, customers, orders } from './schema.postgres.js';
import { loadConfig } from '../config.js';

const { db, pool } = createDb(loadConfig().DATABASE_URL);

const rows = await db
  .select({
    orderId: orders.id,
    customerId: orders.customerId,
    userId: customers.userId,
    username: users.username,
  })
  .from(orders)
  .leftJoin(customers, eq(orders.customerId, customers.id))
  .leftJoin(users, eq(customers.userId, users.id));

console.log(rows);

await pool.end();