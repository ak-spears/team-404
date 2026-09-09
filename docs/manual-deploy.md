# Manual deploy (VM path)

This is the by-hand deploy loop for the current 5 services (`orders-api`, `notify`,
`storefront`, `staff-console`). Automating this into `.github/workflows/deploy.yml`
is a future improvement; until then, this is also the runbook for a first-time VM
bring-up or a manual recovery deploy.

Scope: a single dev VM. There is never a staging or production VM -- this doc only
ever describes one environment.

## 0. Prerequisites

- An Ubuntu 24.04 LTS VM reachable over SSH, with a deploy-only SSH user
  (`crimsoncopies`), Node 22, Docker, and Caddy installed.
- The long-lived infra containers running on the VM (one-time setup):

  ```bash
  docker run -d --name cc-mysql --restart unless-stopped \
    -e MYSQL_ROOT_PASSWORD=<root-pw> -e MYSQL_DATABASE=crimson_copies \
    -e MYSQL_USER=crimson_copies -e MYSQL_PASSWORD=<app-pw> \
    -p 127.0.0.1:3306:3306 \
    -v /var/lib/crimsoncopies/mysql:/var/lib/mysql \
    mysql:8.4

  docker run -d --name cc-minio --restart unless-stopped \
    -e MINIO_ROOT_USER=<access-key> -e MINIO_ROOT_PASSWORD=<secret-key> \
    -p 127.0.0.1:9000:9000 -p 127.0.0.1:9001:9001 \
    -v /var/lib/crimsoncopies/minio:/data \
    minio/minio server /data --console-address ":9001"

  docker run -d --name cc-mailpit --restart unless-stopped \
    -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 \
    -v /var/lib/crimsoncopies/mailpit:/data \
    axllent/mailpit
  ```

- `/opt/crimsoncopies/<service>/` created and owned by the `crimsoncopies` user for
  each of the 4 application services, and each service's `.env` in place (see
  `.env.example` at the repo root and each app/service's own `.env.example` --
  render real values, especially `INTERNAL_API_KEY` and each web app's
  `SESSION_SECRET`, per environment; never commit a real `.env`).
- The 4 systemd units (`deploy/vm/systemd/cc-*.service`) copied to
  `/etc/systemd/system/` and `systemctl daemon-reload`+`enable`d once.
- `deploy/vm/Caddyfile` installed as the VM's Caddy config and Caddy reloaded -- see
  [Reverse proxy](#reverse-proxy) below.
- `pnpm --filter @crimson-copies/orders-api run db:migrate` and
  `pnpm --filter @crimson-copies/orders-api run db:seed` applied against the VM's
  MySQL at least once (see `apps/orders-api/README` for demo credentials the seed
  creates).

## Reverse proxy

`deploy/vm/Caddyfile` is the whole proxy config for this VM's single hostname. It has
no placeholders -- install it verbatim:

```bash
sudo install -m 0644 deploy/vm/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Routing:

| Request path        | Upstream                        |
|---------------------|---------------------------------|
| `/staff`, `/staff/*`| staff-console `127.0.0.1:3001`   |
| everything else     | storefront `127.0.0.1:3000`, failing over to the `:8080` starter page until the first deploy |

staff-console runs under the `/staff` **path prefix**, not a `staff.` subdomain -- the
wildcard cert covers only one label so `staff.<team>.capstone.uamishub.com` can't get a
certificate. `apps/staff-console/next.config.ts` sets `basePath: '/staff'` to match, so
the app owns everything under `/staff` (including `/staff/_next/...` assets and
`/staff/api/...` routes) and Caddy forwards the path unchanged.

> `capstone-app-deploy` does **not** touch Caddy, and a freshly provisioned VM loads its
> Caddyfile from cloud-init (`.devops/chart/base/cloud-init.yaml`), which still matches
> staff-console on the unreachable `staff.` host. Run the `install` + `reload` above once
> by hand after pulling this change; re-run it whenever `deploy/vm/Caddyfile` changes.

## 1. Build

From a clean checkout on your workstation (or CI):

```bash
pnpm install --frozen-lockfile
pnpm --filter @crimson-copies/shared build   # packages/shared has no deploy step of
                                              # its own but every other build needs its
                                              # dist output present first
pnpm --filter <service> build                # repeat per changed service
```

Backend services (`orders-api`, `notify`) build to `dist/`. The two Next.js apps
(`storefront`, `staff-console`) build a **nested** standalone tree at
`apps/<app>/.next/standalone/apps/<app>/server.js` (`outputFileTracingRoot` is the
pnpm workspace root, so Next's monorepo tracing nests one extra `apps/<app>/`
level). `public/` and `.next/static/` are NOT included in that standalone output and
must be copied in separately (step 2).

**Neither `dist/` nor the nested `apps/<app>/` standalone subdir is
self-contained** -- neither ships a real `node_modules`. Backends need
`pnpm --prod deploy` to produce one; Next apps' real `node_modules` (the actual
`next`/`react`/`packages/shared` content the standalone subdir's symlinks point at)
lives at the `.next/standalone/` ROOT, one level above the nested app dir. Step 2
accounts for both.

## 2. Ship the build output to the VM

Backend service (`orders-api` shown; same shape for `notify`) -- stage a
production-only artifact with `pnpm deploy` FIRST, then rsync the WHOLE staged dir:

```bash
pnpm --filter @crimson-copies/orders-api --prod deploy /tmp/deploy-stage/orders-api

rsync -az --delete \
  /tmp/deploy-stage/orders-api/ \
  deploy@<vm-host>:/opt/crimsoncopies/orders-api/
```

The staged dir's `dist/`, `package.json`, and a real, pruned `node_modules/` all
land together at `/opt/crimsoncopies/orders-api/`, matching
`cc-orders-api.service`'s `WorkingDirectory` + `ExecStart=node dist/server.js`
exactly.

Next.js app (`storefront` shown; same shape for `staff-console`, swap the
port/dirs) -- rsync the **whole** `.next/standalone/` tree, not just its nested
`apps/storefront/` subdir, so the real `node_modules` comes along:

```bash
rsync -az --delete \
  apps/storefront/.next/standalone/ \
  deploy@<vm-host>:/opt/crimsoncopies/storefront/

rsync -az --delete apps/storefront/.next/static/ \
  deploy@<vm-host>:/opt/crimsoncopies/storefront/apps/storefront/.next/static/

mkdir -p apps/storefront/public   # no-op once the app ships real static assets
rsync -az --delete apps/storefront/public/ \
  deploy@<vm-host>:/opt/crimsoncopies/storefront/apps/storefront/public/
```

`/opt/crimsoncopies/storefront/` now holds the standalone root (`node_modules/`,
`packages/shared/`, `package.json`) PLUS the nested `apps/storefront/server.js` +
its `public/`/`.next/static/` -- matching `cc-storefront.service`'s
`ExecStart=node apps/storefront/server.js` (relative to that same root).

Do NOT rsync `.env` -- it's rendered on the VM once and never overwritten by a
deploy.

## 3. Restart

```bash
ssh deploy@<vm-host> "sudo systemctl restart cc-orders-api"
ssh deploy@<vm-host> "sudo systemctl restart cc-storefront"
# ...repeat only for the services you actually changed
```

## 4. Verify

```bash
ssh deploy@<vm-host> "systemctl status cc-orders-api --no-pager"
curl -s https://<team>.capstone.uamishub.com/          -o /dev/null -w 'storefront    %{http_code}\n'   # -> 200
curl -s https://<team>.capstone.uamishub.com/staff     -o /dev/null -w 'staff-console %{http_code}\n'   # -> 307 to /staff/login
curl -s https://<team>.capstone.uamishub.com/staff/login -o /dev/null -w 'staff login  %{http_code}\n'  # -> 200
ssh deploy@<vm-host> "curl -s http://127.0.0.1:4000/healthz"     # orders-api, internal-only
ssh deploy@<vm-host> "curl -s http://127.0.0.1:4100/healthz"     # notify, internal-only
```

`/staff` → `307` (the sign-in redirect) is the healthy result -- it proves Caddy is
routing the prefix to `127.0.0.1:3001` and the app's `basePath` is in effect. A `404`
there means the old Caddyfile is still loaded (see [Reverse proxy](#reverse-proxy)).

File upload isn't wired up yet -- `services/file-intake` doesn't exist, so the
storefront's order-confirmation page shows a "coming soon" placeholder instead of
real upload credentials in the meantime.

## 5. Rollback

There's no blue-green on this VM (single dev environment). Rollback = re-run steps
1-3 against the previous commit:

```bash
git checkout <previous-good-sha>
pnpm install --frozen-lockfile && pnpm --filter <service> build
# repeat steps 2-3 above
```
