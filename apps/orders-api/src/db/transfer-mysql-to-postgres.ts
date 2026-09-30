import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';

const EXPECTED_REHEARSAL_ENDPOINT_ID = 'ep-twilight-dust-b42huxjc';

type SourceRow = Record<string, unknown>;

interface TableDefinition {
  name: string;
  columns: string[];
  dateColumns?: string[];
  numericColumns?: string[];
  jsonColumns?: string[];
}

const TABLES: TableDefinition[] = [
  {
    name: 'users',
    columns: ['id', 'username', 'password_hash', 'cwid', 'role', 'created_at'],
    dateColumns: ['created_at'],
    numericColumns: ['id'],
  },
  {
    name: 'customers',
    columns: ['id', 'user_id', 'name', 'email', 'phone', 'created_at'],
    dateColumns: ['created_at'],
    numericColumns: ['id', 'user_id'],
  },
  {
    name: 'orders',
    columns: [
      'id',
      'customer_id',
      'service_type',
      'quantity',
      'spec_notes',
      'payment_method',
      'price_cents',
      'status',
      'created_at',
      'updated_at',
      'pickup_ready_at',
      'completed_at',
    ],
    dateColumns: ['created_at', 'updated_at', 'pickup_ready_at', 'completed_at'],
    numericColumns: ['id', 'customer_id', 'quantity', 'price_cents'],
  },
  {
    name: 'google_identities',
    columns: ['id', 'user_id', 'google_id', 'email', 'created_at'],
    dateColumns: ['created_at'],
    numericColumns: ['id', 'user_id'],
  },
  {
    name: 'order_upload_credentials',
    columns: ['id', 'order_id', 'username', 'password_hash', 'expires_at', 'used_at'],
    dateColumns: ['expires_at', 'used_at'],
    numericColumns: ['id', 'order_id'],
  },
  {
    name: 'order_files',
    columns: [
      'id',
      'order_id',
      'object_key',
      'original_filename',
      'size_bytes',
      'uploaded_via',
      'uploaded_at',
    ],
    dateColumns: ['uploaded_at'],
    numericColumns: ['id', 'order_id', 'size_bytes'],
  },
  {
    name: 'order_events',
    columns: ['id', 'order_id', 'event_type', 'actor', 'payload_json', 'created_at'],
    dateColumns: ['created_at'],
    numericColumns: ['id', 'order_id'],
    jsonColumns: ['payload_json'],
  },
];

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set.`);
  }
  return value;
}

function assertRehearsalTarget(targetUrl: string): void {
  if (process.env.NEON_TARGET_BRANCH !== 'migration-rehearsal') {
    throw new Error('NEON_TARGET_BRANCH must be migration-rehearsal.');
  }

  const hostname = new URL(targetUrl).hostname;
  const endpointId = hostname.split('.')[0]?.replace(/-pooler$/, '');

  if (endpointId !== EXPECTED_REHEARSAL_ENDPOINT_ID) {
    throw new Error('POSTGRES_TARGET_URL is not for the migration-rehearsal endpoint.');
  }

  if (!process.argv.includes('--confirm-rehearsal')) {
    throw new Error('Pass --confirm-rehearsal to allow copying into the rehearsal branch.');
  }
}

function mysqlProjection(table: TableDefinition): string {
  return table.columns
    .map((column) => {
      if (table.dateColumns?.includes(column)) {
        return `DATE_FORMAT(\`${column}\`, '%Y-%m-%d %H:%i:%s.%f') AS \`${column}\``;
      }
      return `\`${column}\``;
    })
    .join(', ');
}

function toSafeInteger(value: unknown, description: string): number | null {
  if (value === null || value === undefined) return null;

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${description} is not a safe JavaScript integer.`);
  }
  return parsed;
}

function toUtcTimestamp(value: unknown, description: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new Error(`${description} was not returned as a MySQL date string.`);
  }

  return `${value.replace(' ', 'T')}Z`;
}

function prepareValue(table: TableDefinition, column: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;

  if (table.numericColumns?.includes(column)) {
    return toSafeInteger(value, `${table.name}.${column}`);
  }

  if (table.dateColumns?.includes(column)) {
    return toUtcTimestamp(value, `${table.name}.${column}`);
  }

  if (table.jsonColumns?.includes(column)) {
    return JSON.stringify(value);
  }

  return value;
}

async function readTable(
  connection: mysql.Connection,
  table: TableDefinition,
): Promise<SourceRow[]> {
  const query = `SELECT ${mysqlProjection(table)} FROM \`${table.name}\` ORDER BY \`id\``;
  const [rows] = await connection.query(query);
  return rows as SourceRow[];
}

async function main(): Promise<void> {
  const sourceUrl = requiredEnvironmentVariable('MYSQL_SOURCE_URL');
  const targetUrl = requiredEnvironmentVariable('POSTGRES_TARGET_URL');

  assertRehearsalTarget(targetUrl);

  const source = await mysql.createConnection(sourceUrl);
  const targetPool = new Pool({ connectionString: targetUrl });
  const target = drizzle(targetPool);
  let sourceTransactionOpen = false;

  try {
    await source.query("SET SESSION time_zone = '+00:00'");
    await source.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    sourceTransactionOpen = true;

    const sourceRows = new Map<string, SourceRow[]>();
    for (const table of TABLES) {
      sourceRows.set(table.name, await readTable(source, table));
    }

    await target.transaction(async (transaction) => {
      for (const table of TABLES) {
        const existing = await transaction.execute(
          sql`SELECT 1 FROM public.${sql.identifier(table.name)} LIMIT 1`,
        );
        if (existing.rows.length > 0) {
          throw new Error(`Target table ${table.name} is not empty; refusing to import.`);
        }
      }

      for (const table of TABLES) {
        const rows = sourceRows.get(table.name) ?? [];

        for (const row of rows) {
          const values = table.columns.map((column) =>
            prepareValue(table, column, row[column]),
          );

          const statement = sql`
            INSERT INTO public.${sql.identifier(table.name)}
            (${sql.join(table.columns.map((column) => sql.identifier(column)))})
            VALUES (${sql.join(values.map((value) => sql`${value}`))})
          `;

          await transaction.execute(statement);
        }

        console.log(`Copied ${rows.length} rows from ${table.name}.`);
      }

      for (const table of TABLES) {
        await transaction.execute(sql`
          SELECT setval(
            pg_get_serial_sequence(${'public.' + table.name}, 'id'),
            GREATEST(COALESCE(MAX(id), 1), 1),
            MAX(id) IS NOT NULL
          )
          FROM public.${sql.identifier(table.name)}
        `);
      }
    });

    await source.query('COMMIT');
    sourceTransactionOpen = false;
    console.log('Transfer completed on migration-rehearsal.');
  } finally {
    if (sourceTransactionOpen) {
      await source.query('ROLLBACK').catch(() => undefined);
    }
    await source.end();
    await targetPool.end();
  }
}

main().catch((error: unknown) => {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  console.error(`Transfer failed (${errorName}); no connection details were printed.`);
  process.exitCode = 1;
});
