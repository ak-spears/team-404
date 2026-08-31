# Crimson Copies

A print-shop ordering app: customers submit print/copy orders and upload files, staff advance
orders through their lifecycle.

## Services

- `apps/storefront` -- customer-facing Next.js app (catalog, order form, order status, sign in).
- `apps/staff-console` -- staff Next.js app (order queue, status updates, uploaded-file links).
- `apps/orders-api` -- Fastify service, sole MySQL writer (Drizzle). Backs both web apps over
  an internal-only HTTP API.
- `services/notify` -- Fastify service. Stubs outbound email (logs what it would send).
- `packages/shared` -- zod schemas, enums, and pricing/status-transition logic shared by the
  services above.

## Local setup

```bash
pnpm install
docker compose up -d          # MySQL, MinIO, Mailpit
pnpm --filter @crimson-copies/orders-api run db:migrate
pnpm --filter @crimson-copies/orders-api run db:seed   # demo accounts, see apps/orders-api/README.md
pnpm -r run dev
```

- storefront: http://localhost:3000
- staff-console: http://localhost:3001
- orders-api: http://127.0.0.1:4000 (internal only)

## Sign in

Both web apps have a username/password `/login` (session cookie, no third-party auth
provider). Guest checkout on the storefront doesn't require signing in; the staff console
requires a staff account for everything. Seeded demo credentials are in
`apps/orders-api/README.md`.

## Checks

```bash
pnpm -r run typecheck
pnpm -r run lint
pnpm -r run build
```

No test step -- see `.github/workflows/ci.yml`.

## Deploy

See `docs/manual-deploy.md` and `docs/manual-secrets.md` (VM + systemd + Caddy; no containers
or orchestrator).
