# orders-api

Internal-only Fastify service. Sole Postgres (Neon) writer (Drizzle) for the `crimson-copies`
app -- `storefront` and `staff-console` never touch the database directly, only this service's
`/api/*` and `/internal/*` routes, over a shared `X-Internal-Key` header.

(The original MySQL schema/repository/migrations still exist under `src/db/schema.ts` and
`drizzle/`, but `server.ts` boots the Postgres stack -- `db:migrate`/`db:seed` below are the
MySQL-era commands and are dead ends against a real deployment; use the `:postgres` variants.)

## Local setup

```bash
# DATABASE_URL in .env must be a Neon/Postgres connection string.
pnpm --filter @crimson-copies/orders-api run db:migrate:postgres
pnpm --filter @crimson-copies/orders-api run db:seed:postgres
pnpm --filter @crimson-copies/orders-api dev
```

`db:seed:postgres` is idempotent -- safe to re-run, it skips usernames that already exist.

## Demo accounts

The seed script creates two local accounts (plaintext dev credentials, not real secrets --
same class as the MySQL/MinIO dev defaults in `docker-compose.yml`):

| Username   | Password          | Role     |
|------------|-------------------|----------|
| `staff`    | `staffpass123`    | staff    |
| `customer` | `customerpass123` | customer |

Sign in with either at `/login` on the storefront or staff-console.
