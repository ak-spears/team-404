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

How these fit together — how an order moves through the system, who calls whom, where
authentication actually happens, and what touches the database and object storage — is in
**[`docs/architecture.md`](docs/architecture.md)**, with diagrams.

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

## Getting onto the VM

Open **<https://team-404-console.uamishub.com>** and sign in with GitHub. You land in a
shell on the VM as `ubuntu`.

That is the whole instruction. No SSH key, no client to install, nothing to configure.

`ubuntu` is the machine's own account and it is shared by your team — your GitHub login is
what gets you *to* the host, not who you are once you are on it. The shell can `sudo`, so
this is all you need for the deploy steps below.

<details>
<summary><b>Optional: SSH, if you want a real terminal</b></summary>

The browser console is enough for everything in this course. SSH is the advanced path — worth
it if you want scrollback, `tmux`, an editor, or `scp`.

The VM imports its logins **from GitHub**. It reads the public keys on the GitHub accounts
listed in `.devops/chart/base/cloud-init.yaml` and re-reads them every 5 minutes, so nobody
hands out keys and nobody has to add you by hand. Two things have to be true:

1. Your GitHub account has an SSH key — check <https://github.com/settings/keys>, and confirm
   with `curl https://github.com/YOUR-USERNAME.keys`, which must print a key rather than
   nothing. (`ssh-keygen -t ed25519` if you have never made one.)
2. Your GitHub username is on the roster in `.devops/chart/base/cloud-init.yaml`. That file
   is the list of who may log in; add yourself and open a PR.

The VM is not on the public internet, so you also need `cloudflared`
(`brew install cloudflared`, or the `.deb`/`.msi` from the
[releases page](https://github.com/cloudflare/cloudflared/releases)). Then, once:

```bash
cloudflared access ssh-config --hostname team-404-ssh.uamishub.com >> ~/.ssh/config
```

and from then on:

```bash
ssh ubuntu@team-404-ssh.uamishub.com
```

`Permission denied (publickey)` is the expected message when your key is not on the VM *yet*:
confirm GitHub actually has it, wait out the 5-minute refresh, then check the roster.

</details>

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
sudo capstone-app-deploy ~/team-404   # env, install, migrate, seed, build, start
```

That is the whole first-time bring-up. `capstone-app-deploy` does the steps in
`docs/manual-deploy.md` for you, on the box, and prints a health check per service at the
end. It is idempotent — re-run it as often as you like.

> **Pass the path explicitly, every time.** Bare `sudo capstone-app-deploy` falls back to
> a directory name hardcoded in the script, which is not this team's. It fails, and the
> error it prints suggests a *different team's* path — ignore that suggestion.
> `sudo capstone-app-deploy ~/team-404` is the form that works.

> **The first deploy takes roughly 30–45 minutes**, almost all of it `next build`. The
> cluster runs these VMs without hardware virtualisation, so the CPU is emulated and
> builds are far slower than on your laptop. Run it under `tmux` (or `nohup`) so a
> dropped console does not kill it. Later deploys are faster — only what changed rebuilds.

Then open **https://team-404.capstone.uamishub.com/** — that is the storefront. Sign in as
`customer` / `customerpass123` (seeded; see `apps/orders-api/README.md`).

The seeded `staff` account also exists, but it currently has nowhere to be used: the staff
console is not published on any public route, so there is no URL that reaches it.
`docs/architecture.md` shows exactly where that stops.

### Redeploying after you change something

`capstone-app-deploy` builds **whatever is sitting in the clone**. It does not fetch. Pull
first — otherwise you get a clean, green, successful build of the code you already had,
which is the most expensive way to waste 40 minutes here:

```bash
cd ~/team-404
git pull
sudo capstone-app-deploy ~/team-404
```

### Doing it by hand instead

`capstone-app-deploy` is a convenience, not a black box — the individual steps still work
and are worth running once to see what it does:

```bash
cd ~/team-404
pnpm install --frozen-lockfile
pnpm --filter @crimson-copies/orders-api run db:migrate
pnpm --filter @crimson-copies/orders-api run db:seed
pnpm build
sudo capstone-app-deploy ~/team-404   # staging + systemd is the fiddly part
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

## What not to touch

`.devops/` is platform-managed: its `promotion.yaml` is what attaches this repo to
ArgoCD, and the chart under `.devops/chart/` is what actually runs the VM. Changing the
app is your job; changing that wiring will detach the VM from GitOps.
