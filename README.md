# team-404 — Crimson Copies

A print-shop ordering app: customers submit print/copy orders and upload files, staff
advance those orders through their lifecycle.

This is the legacy application your team inherits. It runs today the way a lot of real
software does — a pnpm/TypeScript monorepo deployed by hand onto a single VM with
systemd and Caddy. There is no container build and no deployment pipeline. Building
those is the coursework.

## Services

- `apps/storefront` — customer-facing Next.js app (catalog, order form, order status, sign in).
- `apps/staff-console` — staff Next.js app (order queue, status updates, uploaded-file links).
- `apps/orders-api` — Fastify service, sole MySQL writer (Drizzle). Backs both web apps over
  an internal-only HTTP API.
- `services/notify` — Fastify service. Stubs outbound email (logs what it would send).
- `packages/shared` — zod schemas, enums, and pricing/status-transition logic shared by the
  services above.

## Local setup

```bash
pnpm install
docker compose up -d          # MySQL, MinIO, Mailpit (infra only — the apps run on the host)
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

There is no test step — see `.github/workflows/ci.yml`, which runs exactly these three.

## Running on the VM

Your team has one VM (there is never a staging or production VM). The app runs on it as
four systemd units — `cc-storefront`, `cc-staff-console`, `cc-orders-api`, `cc-notify`
(see `deploy/vm/systemd/`) — behind Caddy (`deploy/vm/Caddyfile`).

The by-hand deploy loop, first-time bring-up, and secret handling are in:

- **`docs/manual-deploy.md`** — the deploy/recovery runbook.
- **`docs/manual-secrets.md`** — how the `.env` files are populated (start from `.env.example`).

> `deploy/vm/Caddyfile` still has `__TEAM__` placeholders and hostnames from the app's
> original home. Reconcile them with your team's actual hostname before you rely on it.

## Reaching the VM over SSH

Your VM is a real machine you log into and work on. Nobody hands out keys and nobody
has to add you — you add yourself, and the VM picks you up within about five minutes.

### Step 1 — put an SSH key on your GitHub account (almost everyone has to do this)

**Do not skip this.** Most students have never uploaded an SSH key, and the VM imports
its logins *from GitHub*. If your GitHub account has no key, everything below will look
like it worked and you still will not be able to log in — there is no error message
that tells you why. Check <https://github.com/settings/keys> first.

```bash
ssh-keygen -t ed25519                 # press Enter at every prompt; skip if you already have one
cat ~/.ssh/id_ed25519.pub             # copy this whole line
```

Paste that line into <https://github.com/settings/keys> → **New SSH key**.

You can confirm GitHub has it — this must print your key, not nothing:

```bash
curl https://github.com/YOUR-GITHUB-USERNAME.keys
```

### Step 2 — install `cloudflared`

The VM is not on the public internet. `cloudflared` is the tunnel client that gets you
to it.

```bash
brew install cloudflared                                   # macOS
# Windows: download the .msi from https://github.com/cloudflare/cloudflared/releases
# Linux:   sudo apt install cloudflared   (or the .deb from the same releases page)
```

### Step 3 — teach SSH about the host (once)

```bash
cloudflared access ssh-config --hostname team-404-ssh.uamishub.com >> ~/.ssh/config
```

### Step 4 — log in

```bash
ssh ubuntu@team-404-ssh.uamishub.com
```

A browser window opens the first time so you can sign in with your university account.
You log in as the user `ubuntu` — that is the machine's account, shared by the team;
your own identity is what gets you *to* the host.

### If it says `Permission denied (publickey)`

That is the expected message when your key is not on the VM **yet**. In order:

1. Did step 1 actually land? `curl https://github.com/YOUR-USERNAME.keys` must print a key.
2. Did you only just add it? The VM re-reads GitHub **every 5 minutes**. Wait, retry.
3. Still stuck after ~10 minutes? Your GitHub username may not be on the team roster in
   `.devops/chart/base/cloud-init.yaml`. Add it, open a PR — that file is the list of
   who may log in.

The refresh is a timer inside the VM, so this works even though nobody is logged in and
even though the VM was built before you uploaded anything.

## What not to touch

`.devops/` is platform-managed: its `promotion.yaml` is what attaches this repo to
ArgoCD, and the chart under `.devops/chart/` is what actually runs the VM. Changing the
app is your job; changing that wiring will detach the VM from GitOps.
