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

Your team has one VM (there is never a staging or production VM). It is already set up:
the VM's cloud-init installs the whole runtime on first boot, so you do **not** install
Node, MySQL, MinIO or Caddy yourself. There is **no Docker on the VM** — `docker compose`
is for your laptop only. On the VM those services are installed natively.

Already on the box when you first log in:

| | |
|---|---|
| Node 22 + pnpm 9 | `node -v`, `pnpm -v` |
| MySQL 8.0 | database `crimson_copies`, user `crimson_copies`, loopback only |
| MinIO | `127.0.0.1:9000`, bucket `order-files` already created |
| Caddy | listening on `:80` — the only public door into the VM |
| your `.env` files | generated per-VM in `/etc/capstone/env/`, secrets already matched across services |

### Deploy

```bash
gh auth login                                        # device flow, in your browser
git clone https://github.com/UA-MIS/team-404 ~/team-404
sudo capstone-app-deploy                             # env, install, migrate, seed, build, start
```

That is the whole first-time bring-up. `capstone-app-deploy` does the steps in
`docs/manual-deploy.md` for you, on the box, and prints a health check per service at the
end. Re-run it after any change — it is idempotent.

> **The first deploy takes roughly 30–45 minutes**, almost all of it `next build`. The
> cluster runs these VMs without hardware virtualisation, so the CPU is emulated and
> builds are far slower than on your laptop. Run it under `tmux` (or `nohup`) so a
> dropped console does not kill it. Later deploys are faster — only what changed rebuilds.

Then open **https://team-404.capstone.uamishub.com/** — that is the storefront.
Sign in with the seeded demo accounts (`staff` / `staffpass123`, `customer` /
`customerpass123`; see `apps/orders-api/README.md`).

### Doing it by hand instead

`capstone-app-deploy` is a convenience, not a black box — the individual steps still work
and are worth running once to see what it does:

```bash
cd ~/team-404
pnpm install --frozen-lockfile
pnpm --filter @crimson-copies/orders-api run db:migrate
pnpm --filter @crimson-copies/orders-api run db:seed
pnpm build
sudo capstone-app-deploy          # staging + systemd is the fiddly part; let it do that
```

`db:migrate` and `db:seed` must run **from this clone**, not from `/opt/crimsoncopies/` —
they run through `tsx`, which is a dev dependency, and the deployed copy has production
dependencies only.

### Where things are

- Units: `cc-storefront`, `cc-staff-console`, `cc-orders-api`, `cc-notify`
  (`deploy/vm/systemd/`, installed to `/etc/systemd/system/` by the deploy script).
- Deployed code: `/opt/crimsoncopies/<service>/`, running as the `crimsoncopies` user.
- Logs: `journalctl -u cc-storefront -f` (and likewise per service).
- Guest build log: `/var/log/capstone-lab-install.log` — what cloud-init installed and
  whether any of it failed.

`docs/manual-deploy.md` remains the reference for the underlying steps and for rollback;
`docs/manual-secrets.md` describes the `.env` contents (already rendered for you on the VM).

> **`deploy/vm/Caddyfile` is coursework and is deliberately still unfinished.** It has
> `__TEAM__` placeholders and three hostnames from the app's original home
> (`storefront.`/`staff.`/`mail.<team>.crimsoncopies.dev.uamishub.com`). Your VM has
> exactly **one** public hostname, so the config actually serving traffic is the one
> cloud-init installs at `/etc/caddy/Caddyfile`, which sends `:80` to the storefront.
> Reconciling the repo's Caddyfile with the VM's real topology is your exercise — nobody
> has done it for you.

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
