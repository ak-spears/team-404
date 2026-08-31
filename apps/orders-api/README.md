# orders-api

Internal-only Fastify service. Sole MySQL writer (Drizzle) for the `crimson-copies` app --
`storefront` and `staff-console` never touch the database directly, only this service's
`/api/*` and `/internal/*` routes, over a shared `X-Internal-Key` header.

## Local setup

```bash
pnpm --filter @crimson-copies/orders-api run db:migrate
pnpm --filter @crimson-copies/orders-api run db:seed
pnpm --filter @crimson-copies/orders-api dev
```

`db:seed` is idempotent -- safe to re-run, it skips usernames that already exist.

## Demo accounts

The seed script creates two local accounts (plaintext dev credentials, not real secrets --
same class as the MySQL/MinIO dev defaults in `docker-compose.yml`):

| Username   | Password          | Role     |
|------------|-------------------|----------|
| `staff`    | `staffpass123`    | staff    |
| `customer` | `customerpass123` | customer |

Sign in with either at `/login` on the storefront or staff-console.
