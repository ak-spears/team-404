import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema.js';

export type Db = MySql2Database<typeof schema>;

export function createDb(databaseUrl: string): { db: Db; pool: mysql.Pool } {
  const pool = mysql.createPool(databaseUrl);
  const db = drizzle(pool, { schema, mode: 'default' });
  return { db, pool };
}
