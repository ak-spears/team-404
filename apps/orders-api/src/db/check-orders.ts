import { eq } from 'drizzle-orm';
import { createDb } from './client';
import { users, customers, orders } from './schema';
import { loadConfig } from '../config';

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
