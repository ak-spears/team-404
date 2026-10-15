# Moving Crimson Copies off its VM and onto Kubernetes

**For:** `paper-papas`, `ss-evan-and-emily`, `team-404`
**Your assignment:** replace the one KubeVirt VM your app runs on with multi-environment (dev → staging → prod) container deployments on the LabMx platform, as a sequence of small pull requests.

You can already build this app. You have not shipped it to Kubernetes. This guide is the map. Every YAML block in it is adapted from files that exist and run today on this platform (`UA-MIS/surfer` is the public-to-you working reference for conventions). Read the real files next to this guide; do not trust any guide, including this one, over what the files say.

Where your three repos differ, the guide says so in a **▶ Your repo** box. Where something is not yet known, it says **UNKNOWN** and tells you who to ask.

---

## 0. Ground rules

1. **You never run `kubectl`.** Not for deploying, debugging, or "just checking". The platform is designed so that you cannot need it. Everything below uses git, GitHub Actions, the ArgoCD web UI, the Harbor web UI, the DB console, and the browser. (Local `docker` is fine; that is your laptop, not the cluster.)
2. **If a change is not in your repo, it does not exist.** Nobody hand-edits a running thing. If it is wrong, you fix the file and merge.
3. **The VM keeps serving until the replacement is proven.** Nothing in PRs 1–7 may change what the VM does. You will not delete `virtualmachine.yaml` until PR 10.
4. **One small PR at a time, each independently reviewable and revertable.** Each PR below says what it changes, why, how you *observe* that it worked, and what must not regress.
5. **Do not touch `.devops/chart/` (the VM chart) until PR 10.** Section 5 explains why this is more dangerous than it looks.

---

## 1. The idea that makes the rest make sense

A VM is a **pet**. You SSH in, install things, edit `/etc/caddy/Caddyfile`, `systemctl restart cc-orders-api`. Its state is whatever happened to it. Nobody can fully say what is on it.

A Deployment is **cattle**. It is a description, in git, of "run N copies of this image with this config." If a pod dies, the platform makes another from the same description. If you want it different, you change the description. There is nothing to log into, and nothing you did by hand survives the next restart.

Your VM today is a pet that happens to be described in git (`cloud-init.yaml`) — but cloud-init only runs on *first boot*. After that, `/opt/crimsoncopies/*/.env`, the Caddyfile on disk, and the MySQL data directory are all hand-maintained. The assignment is to move every one of those into a file.

### What you have → what you need

| On the VM today | On Kubernetes |
| --- | --- |
| One VM running everything | One **Deployment per app** (`orders-api`, `storefront`, …, `notify`) |
| `deploy/vm/systemd/cc-*.service` (`ExecStart=node dist/server.js`, `Environment=PORT=…`) | the container's `command`, `env`, and `ports` in that app's Deployment |
| `/opt/crimsoncopies/<svc>/.env` (hand-written, never overwritten) | a `ConfigMap` (non-secret) + an `ExternalSecret` → Kubernetes `Secret` (secret) |
| `deploy/vm/Caddyfile` — `reverse_proxy 127.0.0.1:3000` | an `Ingress` (rules) + one `Service` per app (the stable address) |
| `127.0.0.1:4000` / `127.0.0.1:4100` (loopback, "internal only") | `http://<app>-orders-api` (a ClusterIP `Service`, no Ingress rule = internal only) |
| MySQL installed natively by cloud-init | the platform's MariaDB; you get a schema + user per environment |
| MinIO installed natively by cloud-init | a MinIO `Deployment` + `PersistentVolumeClaim` in your own namespace (PR 5) |
| `cloud-init.yaml` injecting keys and packages | a `Dockerfile` (packages) + `ExternalSecret` (keys) |
| SSH / web console into the box to debug | ArgoCD pod logs (web UI), Grafana, the DB console |
| One namespace, `<team>-vm-prod` | Three: `<team>-dev`, `<team>-staging`, `<team>-prod` |
| "Deploy" = rsync + restart (`docs/manual-deploy.md`) | merge to `main` → CI builds an image → a bot commit bumps the tag → ArgoCD syncs |

Notice the last row. **You do not deploy anything.** You change files; CI and ArgoCD do the rest. That is why verification (section 7) matters so much: there is no step where *you* did the thing and saw it work.

---

## 2. What you are actually moving

Read this table against your own repo before you start. The VM runs more than the apps.

| Thing | Where it runs on the VM | Port | Becomes |
| --- | --- | --- | --- |
| `orders-api` (Fastify, sole DB writer) | systemd `cc-orders-api`, loopback | 4000 | Deployment + internal Service |
| `storefront` (Next.js standalone) | systemd `cc-storefront`, loopback | 3000 | Deployment + Service + Ingress `/` |
| `staff-console` (Next.js, `basePath: '/staff'`) | systemd `cc-staff-console`, loopback | 3001 | Deployment + Service + Ingress `/staff` |
| `notify` (Fastify, a **stub** — sends no email) | systemd `cc-notify`, loopback | 4100 | Deployment + internal Service |
| MySQL | native `mysql-server` | 3306 | platform MariaDB (auto-provisioned) |
| MinIO (order file uploads) | native binary | 9000 | Deployment + PVC (PR 5) |
| Caddy | native, `:80` | 80 | the platform's Traefik, driven by your Ingress |
| ttyd web console / SSH / roster-key import | cloud-init | 7681 / 22 | **nothing** — this is VM-only plumbing and it retires |

(`docs/manual-deploy.md` in your repo still shows `docker run` for MySQL/MinIO. The systemd units and `cloud-init.yaml` say they are native on the VM. Trust the units.)

### ▶ Your repo — the three repos are not identical

| | `paper-papas` | `ss-evan-and-emily` | `team-404` |
| --- | --- | --- | --- |
| Deployable apps | `orders-api`, `storefront`, `notify` (**3**) | + `staff-console` (**4**) | + `staff-console` (**4**) |
| Staff UI | **inside `storefront`** at `/staff` (role-gated) | separate `staff-console` app, `basePath: '/staff'` | separate `staff-console` app, `basePath: '/staff'` |
| Login | **Clerk** (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) | hand-rolled signed cookie (`SESSION_SECRET`) | hand-rolled signed cookie (`SESSION_SECRET`) |
| Who talks to MinIO | `storefront` | `storefront`, `staff-console` | `orders-api`, `storefront`, `staff-console` |
| Browser-visible MinIO links | presigned URLs (`lib/minio.ts`) | `/order-files/*` proxied by Caddy | `MINIO_PUBLIC_*` env vars (presigned) |
| Stripe | yes (`STRIPE_*`, webhook) | yes | check your `config.ts` |
| VM-only console ingress | `base/console-ingress.yaml` | `components/console-public/` | `components/console-public/` |
| `deploy/vm/Caddyfile` | accurate | **stale template** (`__TEAM__`, `staff.` subdomain) — the real one is in `cloud-init.yaml` | accurate (uses `/staff` path) |

Practical consequences:

- **`paper-papas`**: you have 3 Deployments, one Ingress rule to `storefront`, and Clerk's keys to place. Skip every `staff-console` block below.
- **`ss-evan-and-emily`, `team-404`**: 4 Deployments. Two apps read an env var called `SESSION_SECRET` and **must receive different values** (section 6, "env precedence" has the worked example). `paper-papas` does not have this problem.
- **`team-404`**: `orders-api` also touches MinIO directly (`src/lib/storage.ts`), so it needs MinIO env too.
- Your `.devops/chart/` already contains VM files. Don't confuse them with the container chart you are about to build — they have the same file names in places (`ingress.yaml`, `service.yaml`, `kustomization.yaml`).

---

## 3. Platform facts you must follow

These are not generic Kubernetes. Each was read from the platform (`UA-MIS/platform-infra`) or the reference repos, not assumed.

### 3.1 Images → Harbor

Images are pushed to `harbor.capstone.uamishub.com/<team>/<image>:<tag>`. For a multi-app repo the image repo name is `<app>-<component>`, e.g.
`harbor.capstone.uamishub.com/paper-papas/paper-papas-orders-api:<tag>`.

**Tags are written for you by CI. You never type one.**

| Event | Env | Tag |
| --- | --- | --- |
| push to `main` | dev | `git describe` — a short git hash, or `v0.1.0-5-gabc1234` once a `v*` tag exists |
| push of `vX.Y.Z` tag | staging | `X.Y.Z` (immutable) |
| manual **promote-to-prod** run | prod | the same `X.Y.Z` that staging runs — **no rebuild** |
| pull request | (preview) | `pull-<short-sha>` |

> **Tag length.** You may have heard "tags are a 12-character SHA, not 7." Current tenant CI resolves a **7-character** hash (`cut -c1-7` / `git describe`'s default; `surfer`'s dev overlay pins `6e357b3`). Some *platform-internal* builds use 12. The lesson is the same either way: **never retype a tag from `git log` or the GitHub UI.** Copy it from the CI run's resolve step or from the bot's `ci: bump dev images to …` commit. A tag that was never pushed is an `ImagePullBackOff`.

### 3.2 CI is a ~10-line caller, not a copy

Your repo's `.github/workflows/build-and-push.yaml` today is a **VM validation-only** workflow (no build). It becomes this — the real caller from the platform's own scaffolder skeleton:

```yaml
name: build-and-push
on:
  push:
    branches: [main]      # -> dev image
    tags: ["v*"]          # -> staging image
  pull_request:           # -> preview-tagged image, build + checks
  workflow_dispatch:      # -> manual re-run; the ref decides the env
jobs:
  ci:
    permissions:
      contents: write       # the dev bump pushes a commit to main
      actions: read
      pull-requests: write
    secrets: inherit
    uses: UA-MIS/platform-infra/.github/workflows/tenant-build.yaml@v1
    with:
      runner: ${{ vars.RUNNER_SCALE_SET || 'ua-mis-kaniko' }}
```

> ⚠ **Do not copy `surfer`'s `.github/workflows/build-and-push.yaml`.** It is a ~600-line **inlined copy** of an older pipeline, not a call to `tenant-build.yaml@v1`. Copies drift; that drift is the single largest source of bugs on this platform. Use the caller above.

The central pipeline reads two files from **your** repo: `.devops/components.yaml` (what to build) and `.devops/promotion.yaml` (which git event goes to which environment overlay). It builds each component with **Kaniko** (no Docker daemon — your Dockerfile must be plain and not rely on BuildKit-only features), scans source for secrets (`gitleaks`, blocking), runs per-language checks, builds, pushes, runs a Harbor vulnerability gate, then commits the new tag into your overlay.

### 3.3 Secrets: portal → Vault → ESO → Secret → (restart) → container

```
Secrets tab (The Process) ─► Vault: tenants/<team>/<env>/app ─► External Secrets Operator
      ─► Kubernetes Secret "<app>-secret" ─► container env  (read ONCE, at container start)
```

- You type values in **The Process → your component → Secrets tab**, choosing an environment. Never in git, never in a `.env` you commit. Dev, staging and prod are different Vault paths; set each separately.
- The `ExternalSecret` in your overlay holds only the **path**, never a value.
- Referencing a Secret with `optional: true` lets a pod start when the Secret does not exist yet. That is convenient and also dangerous: a pod can come up **Ready, serving 200, with no secrets loaded**.
- **Env vars are resolved only when a container starts.** Sealing a secret afterward does not change a running pod. Surfer's Deployments carry an annotation, `secret.reloader.stakater.com/reload: "<app>-secret"`, which makes the platform's Reloader restart the pods when that Secret changes. Copy it. Without it you must trigger a new rollout yourself.
- A plain `secretKeyRef` / `secretRef` *without* `optional: true` makes a missing secret a loud `CreateContainerConfigError` instead of a silently-unconfigured pod. For a variable the app cannot function without (`INTERNAL_API_KEY`), that is the better failure. Choose per variable.

### 3.4 Environment-variable precedence (this froze all three surfer environments last week)

Kubernetes builds a container's environment in this order. **Later beats earlier.**

1. `envFrom` sources, in list order — **the last `envFrom` entry wins** on a duplicate key.
2. Explicit `env:` entries — **an explicit `env:` entry beats every `envFrom`.**

And the shape rule: `envFrom` is a list of `configMapRef` / `secretRef` objects **only**.

```yaml
# VALID
envFrom:
  - configMapRef: { name: paper-papas-config }
  - secretRef:    { name: paper-papas-secret, optional: true }   # wins over the ConfigMap on a duplicate
env:
  - name: PORT            # beats both of the above
    value: "4000"

# INVALID — a name/value pair is not an envFrom entry.
envFrom:
  - name: PORT            # ArgoCD refuses the WHOLE Deployment: unknown field
    value: "4000"         # (this exact mistake froze all three surfer environments)
```

Use this on purpose:

- **Pin what must not be overridable** with an explicit `env:` entry. Surfer pins `SHOW_RMP_DIFFICULTY=false` that way so a value sealed in the Secrets tab can't switch it on.
- **Map one Secret key to a differently-named variable** with `env.valueFrom.secretKeyRef` (the `SESSION_SECRET` case, section 6, PR 4).
- If a Secrets-tab value "doesn't take effect," check whether an explicit `env:` entry in the Deployment is shadowing it before you suspect Vault.

### 3.5 Promotion is a button, not a branch

| To get to… | Do this |
| --- | --- |
| **dev** | merge to `main` |
| **staging** | `git tag v0.1.0 && git push origin v0.1.0` (cut a release) |
| **prod** | GitHub → **Actions → promote-to-prod → Run workflow**, `from: staging` |

`promote-to-prod` is a `workflow_dispatch`. It copies **the tag staging is running right now** into the prod overlay. It never rebuilds, so what you tested in staging is exactly what ships. If nothing changed it says so and exits without a commit — read its summary.

### 3.6 Your three namespaces, and what the platform puts in them

You do **not** create namespaces, quota, network policies, the Vault role, or the Harbor project. The platform does, from a `CapstoneTenant` claim (section 4). Once it exists, each of `<team>-dev`, `<team>-staging`, `<team>-prod` has:

- **Pod security `restricted`**: your containers must run non-root with `seccompProfile: RuntimeDefault`, `allowPrivilegeEscalation: false`, `capabilities: drop: [ALL]`. (Copy the securityContext blocks below.) User 65532 is the convention.
- **Quota per env**: 4 CPU / 4 Gi *requests*, 8 CPU / 8 Gi *limits*, 24 pods (28 in prod), 15 Services, 4 PVCs (6 in prod) with 5 Gi total storage (20 Gi in prod).
- **LimitRange**: defaults of 50m / 64Mi requests and 500m / 256Mi limits; **no container may exceed 1 CPU / 1 Gi.** Next.js needs more than the 256 Mi default — set `resources` explicitly.
- **NetworkPolicy**: default-deny, then: ingress from Traefik and from pods in the *same namespace*; egress to DNS, to pods in the same namespace, to the database tier, and (default on) outbound **TCP 443 to the internet**. Port 80 and everything else outbound is closed, and a blocked connection **times out; it does not refuse**. "Slow" usually means "blocked". Clerk and Stripe are 443, so they work.
- **A `SecretStore` named `vault-tenant`** and the `eso-tenant` ServiceAccount. **Do not ship your own copies** (`secretstore.yaml`) — the platform already owns them, and two owners fight. Some scaffold templates and `surfer`'s overlays still ship one; for a claim-provisioned tenant, omit it.
- **A Harbor pull secret** for your private project. Your ServiceAccount references `harbor-pull`.
- **Argo CD AppProject** that only lets you create: ConfigMap, Service, ServiceAccount, PVC, Deployment, StatefulSet, Job/CronJob, HPA, Ingress, ExternalSecret, SecretStore, PodDisruptionBudget, ServiceMonitor, Rollout, SealedSecret. Anything else (e.g. a `VirtualMachine`, a `Secret`, a `NetworkPolicy`) is refused.

**Hostnames are single-label** under `capstone.uamishub.com` — the Cloudflare certificate covers exactly one wildcard level:

| Env | Host (storefront) |
| --- | --- |
| dev | `paper-papas-dev.capstone.uamishub.com` |
| staging | `paper-papas-staging.capstone.uamishub.com` |
| prod | `paper-papas.capstone.uamishub.com` |

(`docs/developer/*.md` and `surfer`'s dev overlay show `app.dev.capstone…`; that two-label form can't get a certificate. Use the single-label form.)

**dev and staging are behind SSO.** Any request to them without a UA-MIS GitHub login is redirected to the sign-in page. Two consequences you must plan for:

- `curl https://paper-papas-dev.capstone.uamishub.com/` returns a **302 to the login page**. That is the gate working, not your app. Use a logged-in browser for dev/staging. Only prod is public.
- Stripe cannot deliver a webhook to dev or staging (it would be redirected to login). Webhook testing happens in prod, or you ask the owner (a claim flag `publicDevIngress` exists).

The gate attaches to the Ingress **by name**: it must be named exactly your app name (`paper-papas`). **Rename it and dev/staging become public with no warning.**

### 3.7 Where to look when something is wrong (you have no `kubectl`)

| You want | Go to |
| --- | --- |
| Is it deployed? Sync/health, resource tree, pod count, pod logs | **ArgoCD** (`argocd.capstone.uamishub.com`, GitHub login). Your app is `<team>-dev` / `-staging` / `-prod`. Your team can *get*, *sync*, and read *logs* for your own apps only. |
| Did the image build? What tag? | **GitHub → Actions** run; then the `ci: bump dev images to …` commit on `main` |
| Is the image in the registry? | **Harbor** (`harbor.capstone.uamishub.com`) → project `<team>` → repository → tags |
| Is the data right? | **DB console**: `https://<team>-<env>-db.capstone.uamishub.com/` (Adminer behind SSO, scoped to your team) — **UNKNOWN until the claim exists; confirm the exact host there** |
| Metrics / Loki logs | Grafana — **UNKNOWN**: how your team's namespace views are scoped; ask the owner |
| Secrets | **The Process → your component → Secrets tab** |

---

## 4. What you cannot do yourself (owner actions)

Your namespaces, Harbor project, Vault role, CI runner access and DB do not appear from a PR in *your* repo. They come from a **`CapstoneTenant` claim** in `UA-MIS/platform-infra` (`tenants/_claims/<team>-<app>.yaml`), which Crossplane expands into `<team>-dev|staging|prod`, the quota/netpols, an Argo CD AppProject and ApplicationSet, a Harbor project and robots, a Vault policy/role, and (with `database: mysql`) a MariaDB schema + user per environment.

You do not have write access to `platform-infra`, and the claim is a human-reviewed PR there. **Today your three teams are *VM tenants*** (`tenants/team-<team>/vm/`, one namespace `<team>-vm-prod`, an Argo CD project that only allows VM kinds). **A VM tenant has no claim.** Ask the owner to:

1. Add a `CapstoneTenant` claim for your team. The one for `surfers`/`surfer` is the model for a team whose repo already exists (the claim does not create your repo). Needed fields: `team`, `appName`, `semester: 2026-fall`, `database: mysql`, `port`. Keep `previewEnabled: false`.
2. Confirm your GitHub team `UA-MIS/<team>` has you as **members** (outside collaborators get no Argo CD / Harbor / DB-console access).
3. Ask the owner when to apply it — see the timing in PR 4. Applying it earlier than needed produces red apps for weeks.
4. At **cutover** (PR 8) and **retirement** (PR 10): coordinate the VM tier going away.

> **The owner checks one thing before applying your claim** (you can't): whether a Harbor project named `<team>` already exists from VM onboarding. If the claim's Harbor `Project` is created over an existing project of the same name, it will most likely fail with "already exists" and block the push robot behind it. You'll see this as the claim never finishing and the first CI push waiting for a credential that never arrives. It is not your Dockerfile. The owner's notes cover the fix.

**Your data is a separate question from your namespaces.** Each environment gets a **brand-new, empty MariaDB schema** automatically; the app's own `migrate` init container creates the tables. So you never "migrate the database". You decide what, if anything, is *imported* into it — PR 7 teaches how, per table.

Do not wait on these to start. PRs 1–3 need nothing from the owner.

---

## 5. Why the order is what it is — and the trap in your repo

The sequence is built around one constraint: **the VM must keep serving until the replacement is proven**, and one hazard that is specific to your repos.

**The hazard.** The platform's VM ApplicationSet reads your `.devops/promotion.yaml` and syncs whatever path `environments.prod.overlay` names (today `.devops/chart/overlays/prod`) into `<team>-vm-prod`, with `prune: true` and `selfHeal: true`. That path is the *same* path the container design wants for prod, and `base/` is the VM's base too. If you start adding `deployments.yaml` to `.devops/chart/base/` or edit `.devops/chart/overlays/prod/`, **you are editing the live VM's deployment** — and an auto-pruning sync of a changed kustomization can try to delete the VM.

**The fix.** Build the whole container chart in a **separate directory**, `.devops/chart-k8s/`, with the same internal layout you'll end up with:

```
.devops/
  components.yaml            # new (PR 4)
  promotion.yaml             # rewritten in PR 4; prod still points at the VM until PR 8
  chart/                     # the VM chart. DO NOT TOUCH until PR 10.
  chart-k8s/                 # new. Everything in PRs 2, 3, 5, 6 goes here.
    base/        deployments.yaml  services.yaml  ingress.yaml  serviceaccount.yaml
                 configmap.yaml  kustomization.yaml
    overlays/
      dev/       kustomization.yaml  app-secret.externalsecret.yaml  database.externalsecret.yaml
      staging/   (same, plus pdb.yaml)
      prod/      (same, plus pdb.yaml)
```

> **Why `chart-k8s/` exists — read this before you "tidy" it.** It exists only because the VM's Argo CD app is still reading `chart/` and will `prune` anything that disappears from it. It is not a naming whim and not technical debt to fix early. Moving things into `chart/` while the VM still runs edits the live VM. The rename happens once, in the last PR, after the VM is gone. Anyone who "cleans it up" sooner can take your production down.

`promotion.yaml` is the *only* thing that tells the platform which directory is "dev". Until PR 4 points `dev:` at `chart-k8s`, **nothing in the cluster reads it** — so PRs 2 and 3 are inert by construction and you can review them calmly. In PR 10 you delete the VM chart and `git mv chart-k8s chart`, which gives you exactly the layout `surfer` has.

(This directory trick is a recommendation from this guide, not a platform convention. If the owner would rather retire the VM tier first and let you use `.devops/chart/` directly, the PRs are identical except for the path. Ask before PR 2.)

Two more consequences of reading `promotion.yaml` that you should know:

- **Never run `promote-to-prod` before PR 8.** Until prod points at `chart-k8s`, that workflow rewrites `images[].newTag` in the *VM's* prod overlay.
- Until PR 8, the container `prod` app will show **red** in Argo CD (it's pointed at VM manifests its project may not deploy). That is expected and harmless. Do not "fix" it by editing the VM overlay.

### The PR sequence

| # | PR | Cluster effect | Needs owner? |
| --- | --- | --- | --- |
| 1 | Dockerfiles; prove they run locally via `docker-compose.yml` | none | no |
| 2 | `chart-k8s/base`: Deployments, Services, ConfigMap, ServiceAccount | none (inert) | no |
| 3 | Ingress + `overlays/dev` + ExternalSecrets | none (inert) | no |
| — | **Owner applies the claim** | creates namespaces, Harbor, Vault, DB | **yes** |
| 4 | CI caller + `components.yaml` + `promotion.yaml` — **the switch** | **first deploy to dev** | merged after the claim |
| 5 | MinIO + database wiring verified in dev | dev gets stateful pieces | no |
| 6 | `overlays/staging`, `overlays/prod`; first release tag | staging live; prod overlay exists but unused | no |
| 7 | Data: seed dev/staging, rehearse the import, write the prod procedure | dev/staging get fake data | no |
| 8 | **Prod comes up beside the VM** on a holding host; real data imported | prod live but unadvertised | **yes** (VM app neutralised first) |
| 9 | **The flip**: real hostname moves to Kubernetes | **users move** | **yes, same session** |
| 10 | Retire the VM: delete VM chart + `deploy/vm`; `git mv chart-k8s chart` | VM goes away | **yes** (platform-infra side) |

---

## 6. The PRs

Below, `paper-papas` stands for your repo/app/team name (all three of your repos have `team == app` slug). Substitute your own. Package names in the monorepo are `@crimson-copies/<name>`.

### PR 1 — A Dockerfile per app, proven locally

**Changes.** Add `apps/orders-api/Dockerfile`, `apps/storefront/Dockerfile`, `services/notify/Dockerfile` (and `apps/staff-console/Dockerfile` for the two repos that have it). Add the four apps to `docker-compose.yml` behind a `profiles: [apps]` profile.

**Why.** Your `docker-compose.yml` already runs the three *backing services* (MySQL, MinIO, Mailpit). It does not run your apps — its own header says so. That is the on-ramp: the exact `DATABASE_URL`, hostnames and env your apps need in a container, on your laptop, before the cluster is involved. If it doesn't work here, it can't work there, and here you can iterate in seconds.

**The build context is the repo root, not the app directory.** The apps depend on `@crimson-copies/shared` through `workspace:*`; pnpm needs the whole monorepo and the root `pnpm-lock.yaml` visible. This is the pnpm-recommended monorepo pattern:

```dockerfile
# apps/orders-api/Dockerfile   — build with:  docker build -f apps/orders-api/Dockerfile -t paper-papas-orders-api:dev .
# syntax=docker/dockerfile:1
# Base image via the platform's Harbor pull-through cache (the CI runners have :443-only egress and
# anonymous Docker Hub pulls are rate-limited). Override for local builds:
#   --build-arg NODE_IMAGE=node:22-alpine
ARG NODE_IMAGE=harbor.capstone.uamishub.com/dockerhub-proxy/library/node:22-alpine

FROM ${NODE_IMAGE} AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @crimson-copies/shared build
RUN pnpm --filter @crimson-copies/orders-api build

FROM build AS prune
RUN pnpm --filter @crimson-copies/orders-api --prod deploy /prod/orders-api

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prune --chown=65532:65532 /prod/orders-api ./
USER 65532:65532
EXPOSE 4000
CMD ["node", "dist/server.js"]
```

`notify` is the same shape (`@crimson-copies/notify`, port 4100). `storefront` and `staff-console` are Next.js *standalone* builds; `outputFileTracingRoot` (set in your `next.config.ts`) makes the standalone server land at a *nested* path, `.next/standalone/apps/storefront/server.js`, so the runtime stage must account for it:

```dockerfile
# apps/storefront/Dockerfile  (build from the repo root, like the others)
ARG NODE_IMAGE=harbor.capstone.uamishub.com/dockerhub-proxy/library/node:22-alpine
FROM ${NODE_IMAGE} AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1 \
    INTERNAL_API_KEY=build-time-placeholder \
    ORDERS_API_URL=http://127.0.0.1:4000
# paper-papas only (Clerk): ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_placeholder, then
#   ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} CLERK_SECRET_KEY=sk_test_placeholder
# ss-evan-and-emily / team-404: ENV SESSION_SECRET=build-time-placeholder
RUN pnpm --filter @crimson-copies/shared build
RUN mkdir -p apps/storefront/public && pnpm --filter @crimson-copies/storefront build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=65532:65532 /repo/apps/storefront/.next/standalone ./
COPY --from=build --chown=65532:65532 /repo/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=build --chown=65532:65532 /repo/apps/storefront/public ./apps/storefront/public
USER 65532:65532
EXPOSE 3000
WORKDIR /app/apps/storefront
CMD ["node", "server.js"]
```

`staff-console` is the same with `3001` and its own paths. Mind these three, which the VM hid from you:

1. **Listeners must bind `0.0.0.0`.** Your apps default `HOST=127.0.0.1` (`orders-api`, `notify`) and your systemd unit sets `HOSTNAME=127.0.0.1` (Next.js). Loopback inside a container is invisible to the kubelet's probes and to every other pod. This is the single most common "pod Running, app dead" cause. The Dockerfile sets `HOSTNAME=0.0.0.0` for Next; for the Fastify apps you set `HOST=0.0.0.0` in the ConfigMap (PR 2).
2. **`NEXT_PUBLIC_*` values are baked in at build time**, not read at start. `ss-evan-and-emily` / `team-404` have none (sessions are signed server-side with `SESSION_SECRET`, read at runtime), so their images are environment-agnostic and one build can be promoted. **`paper-papas` is different:** Clerk's `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is inlined into the bundle. The central CI pipeline cannot pass a per-environment `--build-arg`, so dev, staging and prod will share **one** Clerk publishable key (one Clerk instance). Put the `ARG` with a placeholder default in the Dockerfile (`NEXT_PUBLIC_CLERK_SIGN_IN_URL` and friends too, if your code sets them), and know this is a limit, not a bug you can solve in the chart.
3. **`next build` validates config at module load**, so the build stage needs placeholder values (`INTERNAL_API_KEY=build-time-placeholder`, `SESSION_SECRET=…`, `ORDERS_API_URL=…`) as `ENV` in the *build* stage only. They are never the real values.

For `paper-papas` + Clerk with development keys (`pk_test_…`) there is a known trap: Clerk's dev-browser flow emits a rewrite to `http://localhost:<port>/`. If Next thinks its own host is `0.0.0.0`/`127.0.0.1`, it proxies that rewrite to itself, hangs for 30 s, and returns 500 **with nothing in the logs**. On the VM this was fixed with `HOSTNAME=localhost` in a systemd drop-in. In a container you must not bind to `localhost` — so keep `HOSTNAME=0.0.0.0` in the **Dockerfile/Deployment** for the listener, and if you see the 30 s hang with Clerk dev keys, that signature (`x-clerk-auth-reason: dev-browser-missing`, `x-middleware-rewrite: http://localhost:3000/`) is the clue. Production Clerk keys (`pk_live_…`) avoid the flow entirely. (Untested for your containers; flagged as the first thing to check if the storefront hangs in dev.)

The compose profile:

```yaml
# docker-compose.yml  (add under services:, keep mysql/minio/mailpit as they are)
  orders-api:
    profiles: [apps]
    build: { context: ., dockerfile: apps/orders-api/Dockerfile }
    depends_on: { mysql: { condition: service_healthy } }
    environment:
      HOST: "0.0.0.0"
      PORT: "4000"
      DATABASE_URL: mysql://crimson_copies:devpassword@mysql:3306/crimson_copies
      INTERNAL_API_KEY: dev-internal-key-change-me
      NOTIFY_URL: http://notify:4100
    ports: ["4000:4000"]
  notify:
    profiles: [apps]
    build: { context: ., dockerfile: services/notify/Dockerfile }
    environment: { HOST: "0.0.0.0", PORT: "4100", INTERNAL_API_KEY: dev-internal-key-change-me }
  # storefront (and staff-console): PORT 3000 / 3001, ORDERS_API_URL: http://orders-api:4000, same INTERNAL_API_KEY
```

Note the hostnames: inside compose, `mysql`, `orders-api`, `notify` are *service names*. In the cluster the same idea becomes `http://paper-papas-orders-api`. Writing your apps' URLs as environment variables (they already are) is what makes the move cheap.

**Verify — real observations.**

```bash
docker compose up -d mysql                       # infra
docker compose --profile apps up --build -d      # your four images, built from the repo root
docker compose ps                                # COUNT the rows: expect mysql + 3 or 4 apps, all "healthy"/"running"
docker compose --profile apps run --rm orders-api node dist/db/migrate.js   # prints "Migrations applied."
curl -s localhost:4000/healthz                   # {"status":"ok"} — this endpoint does SELECT 1 against MySQL
curl -sI localhost:3000/ | head -1               # HTTP/1.1 200 (or the app's real redirect)
```

Then prove the **cluster's restrictions** locally, because the cluster will enforce them and you'd rather learn here:

```bash
docker run --rm --read-only --user 65532:65532 --cap-drop ALL --security-opt no-new-privileges \
  -e HOST=0.0.0.0 -e PORT=4100 -e INTERNAL_API_KEY=x -p 4100:4100 paper-papas-notify:dev
```

If that crashes with `EROFS`/`EACCES`, find out *now* which path it writes to (Next's `.next/cache` is the usual one; the reference storefront Deployment sets `readOnlyRootFilesystem: false` for that reason).

**Must not regress.** The VM is untouched. `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build` (your existing `ci.yml`) stay green. Don't `git add` any `.env`.

---

### PR 2 — The workloads: Deployments and Services (inert)

**Changes.** Create `.devops/chart-k8s/base/` with `serviceaccount.yaml`, `configmap.yaml`, `deployments.yaml`, `services.yaml`, `kustomization.yaml`. Nothing here is deployed yet (nothing points at it).

**Why.** This is the main translation: one systemd unit → one Deployment, and one `127.0.0.1:PORT` → one Service. It's also where you encode, as files, what used to be a hand-edited `.env`.

```yaml
# .devops/chart-k8s/base/serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: paper-papas
automountServiceAccountToken: false
imagePullSecrets:
  - name: harbor-pull         # created by the platform; do not define it
```

```yaml
# .devops/chart-k8s/base/configmap.yaml  — NON-secret config only. This is your old .env, minus the secrets.
apiVersion: v1
kind: ConfigMap
metadata:
  name: paper-papas-config
data:
  NODE_ENV: "production"
  HOST: "0.0.0.0"                                   # the app default (127.0.0.1) is invisible to probes
  ORDERS_API_URL: "http://paper-papas-orders-api"   # a Service name; Service port is 80 -> container's "http" port
  NOTIFY_URL: "http://paper-papas-notify"
  BCRYPT_ROUNDS: "10"
  FILE_INTAKE_HOST: "file-intake-not-deployed.invalid"   # display-only; nothing listens (see notify/file-intake note in your docs)
  FILE_INTAKE_PORT: "2222"
```

A Service named `paper-papas-orders-api` gives every pod in the namespace a DNS name of exactly that. This is what replaces `127.0.0.1:4000`.

```yaml
# .devops/chart-k8s/base/deployments.yaml  (orders-api shown; notify/storefront/staff-console follow the same shape)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: paper-papas-orders-api
  labels:
    app.kubernetes.io/name: paper-papas
    app.kubernetes.io/component: orders-api
  annotations:
    # Restart the pods when these Secrets change. Env is read ONCE at container start;
    # without this, a value sealed in the Secrets tab never reaches a running pod.
    secret.reloader.stakater.com/reload: "paper-papas-secret,paper-papas-db"
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: paper-papas
      app.kubernetes.io/component: orders-api       # selects ONLY its own pods — see the note below
  template:
    metadata:
      labels:
        app.kubernetes.io/name: paper-papas
        app.kubernetes.io/component: orders-api
    spec:
      serviceAccountName: paper-papas
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        seccompProfile: { type: RuntimeDefault }
      initContainers:
        - name: migrate                              # replaces `pnpm db:migrate` on the VM
          image: paper-papas-orders-api:latest       # placeholder; overlays rewrite registry+tag (PR 3)
          command: ["node", "dist/db/migrate.js"]    # compiled JS — `tsx` is a devDependency, not in the image
          envFrom:
            - configMapRef: { name: paper-papas-config }
            - secretRef:    { name: paper-papas-db }          # DATABASE_URL
            - secretRef:    { name: paper-papas-secret }      # INTERNAL_API_KEY (the config schema requires it)
          resources:
            requests: { cpu: 50m,  memory: 96Mi }
            limits:   { cpu: 300m, memory: 256Mi }
          securityContext:
            allowPrivilegeEscalation: false
            capabilities: { drop: [ALL] }
            readOnlyRootFilesystem: true
      containers:
        - name: orders-api
          image: paper-papas-orders-api:latest
          ports:
            - { name: http, containerPort: 4000 }
          envFrom:
            - configMapRef: { name: paper-papas-config }
            - secretRef:    { name: paper-papas-db }
            - secretRef:    { name: paper-papas-secret }     # last envFrom wins on a duplicate key
          env:
            - { name: PORT, value: "4000" }                  # explicit env beats every envFrom
          readinessProbe:
            httpGet: { path: /healthz, port: http }          # does SELECT 1 — not ready until the DB answers
            initialDelaySeconds: 3
            periodSeconds: 10
          livenessProbe:
            tcpSocket: { port: http }                        # liveness must NOT depend on the DB, or a DB blip restarts every pod
            initialDelaySeconds: 15
            periodSeconds: 20
          resources:
            requests: { cpu: 50m,  memory: 96Mi }
            limits:   { cpu: 300m, memory: 256Mi }
          securityContext:
            allowPrivilegeEscalation: false
            capabilities: { drop: [ALL] }
            readOnlyRootFilesystem: true
          volumeMounts:
            - { name: tmp, mountPath: /tmp }                 # read-only root fs needs a writable /tmp
      volumes:
        - { name: tmp, emptyDir: {} }
```

(The `tcpSocket` liveness above is deliberate: `orders-api`'s `/healthz` returns 503 when MySQL is unreachable, and a liveness probe that fails on a *dependency* restarts healthy pods during a database blip.)

**The selector rule that bites people.** Each Deployment's `selector.matchLabels` and each Service's `selector` must include `app.kubernetes.io/component: <that app>`. If you select only on `app.kubernetes.io/name`, every Service routes to every pod, and `orders-api` traffic lands on the storefront. It will *look* fine until the one request that matters.

```yaml
# .devops/chart-k8s/base/services.yaml  (one per app; there is NO ingress rule for orders-api and notify = internal only)
apiVersion: v1
kind: Service
metadata:
  name: paper-papas-orders-api
  labels: { app.kubernetes.io/name: paper-papas, app.kubernetes.io/component: orders-api }
spec:
  type: ClusterIP
  selector: { app.kubernetes.io/name: paper-papas, app.kubernetes.io/component: orders-api }
  ports:
    - { name: http, port: 80, targetPort: http, protocol: TCP }
```

**storefront** (`paper-papas` shape; PORT 3000). Differences from `orders-api`: no `migrate` initContainer; `env` pins `PORT` and `HOSTNAME`; `readOnlyRootFilesystem: false` (Next writes `.next/cache`; or mount an `emptyDir` there and keep it `true`); resources `requests 100m/192Mi, limits 500m/512Mi` — Next outgrows the 256 Mi default.

```yaml
          env:
            - { name: PORT,     value: "3000" }
            - { name: HOSTNAME, value: "0.0.0.0" }
          # paper-papas: Clerk + Stripe + MinIO come from the Secret (below), not from here.
```

**▶ ss-evan-and-emily / team-404: the two-`SESSION_SECRET` problem.** `storefront` and `staff-console` both read a variable called `SESSION_SECRET`. If both get it through the *same* `envFrom: secretRef`, they get the *same value*, and a customer's session cookie becomes a valid staff one. Store two keys in Vault (`STOREFRONT_SESSION_SECRET`, `STAFF_CONSOLE_SESSION_SECRET`), and in each Deployment map its own with an explicit `env:` entry — which is *exactly* the precedence rule from 3.4 doing useful work:

```yaml
        # in the storefront container:
          env:
            - name: SESSION_SECRET
              valueFrom:
                secretKeyRef: { name: paper-papas-secret, key: STOREFRONT_SESSION_SECRET }
        # in the staff-console container:
            - name: SESSION_SECRET
              valueFrom:
                secretKeyRef: { name: paper-papas-secret, key: STAFF_CONSOLE_SESSION_SECRET }
```

(Do *not* also `envFrom` a `SESSION_SECRET` in that Secret. If a stray `SESSION_SECRET` key exists in Vault, the explicit `env:` still wins — good — but you'll waste an afternoon wondering why changing it does nothing.)

```yaml
# .devops/chart-k8s/base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - serviceaccount.yaml
  - configmap.yaml
  - deployments.yaml
  - services.yaml
  # ingress.yaml is added in PR 3
labels:
  - pairs:
      app.kubernetes.io/name: paper-papas
      app.kubernetes.io/managed-by: argocd
      platform.capstone/team: paper-papas
    includeSelectors: false        # do NOT let kustomize rewrite your selectors
```

**Verify — real observations (no cluster needed).**

```bash
kustomize build .devops/chart-k8s/base > /tmp/base.yaml     # install standalone `kustomize`; this is your laptop, not kubectl
grep -c '^kind: Deployment' /tmp/base.yaml                   # COUNT it: paper-papas 3, the other repos 4
grep -c '^kind: Service$'   /tmp/base.yaml                   # same number
grep -n 'component:' /tmp/base.yaml | sort | uniq -c         # every selector names exactly one component
```

Read the output of `kustomize build` — it's the ground truth of what ArgoCD will see. Grep it for `envFrom:` and make sure every entry is a `configMapRef` or `secretRef`; a `name:` directly under `envFrom:` is the surfer-freeze mistake.

**Must not regress.** `git diff --stat` shows **only** `.devops/chart-k8s/**`. The VM chart is byte-identical. No new Argo CD app appears.

---

### PR 3 — Ingress, the dev overlay, and the ExternalSecrets (inert)

**Changes.** Add `base/ingress.yaml`; add `overlays/dev/{kustomization.yaml,app-secret.externalsecret.yaml,database.externalsecret.yaml}`; add `ingress.yaml` to the base kustomization.

**Why.** The Caddyfile's job — "this hostname/path goes to that process" — becomes an Ingress. `cloud-init`'s job — "put these values in `.env`" — becomes two ExternalSecrets. Your overlay is where "dev" differs from "prod": hostname, replica count, which Vault path.

```yaml
# .devops/chart-k8s/base/ingress.yaml          ▶ paper-papas (storefront serves /staff itself)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: paper-papas               # MUST equal your app name — the non-prod SSO gate attaches by this name
  labels: { app.kubernetes.io/name: paper-papas }
spec:
  rules:
    - host: paper-papas.capstone.uamishub.com       # prod host; overlays patch it
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: paper-papas-storefront, port: { name: http } } }
  tls:
    - hosts: [paper-papas.capstone.uamishub.com]
```

**▶ ss-evan-and-emily / team-404** add a second path to the **same** host and the **same** Ingress, mirroring the Caddy `@staff path /staff /staff/*` block. The `staff-console` already sets `basePath: '/staff'`, so it expects the `/staff` prefix un-stripped. **Longest prefix wins**, so `/staff` beats `/`:

```yaml
          - path: /staff
            pathType: Prefix
            backend: { service: { name: ss-evan-and-emily-staff-console, port: { name: http } } }
```

`orders-api` and `notify` get **no rule**. That is how they stay internal (Caddy's "never reverse-proxied" comment, now enforced by the absence of a line).

```yaml
# .devops/chart-k8s/overlays/dev/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: paper-papas-dev                # the namespace the platform creates
resources:
  - ../../base
  - app-secret.externalsecret.yaml
  - database.externalsecret.yaml          # NOTE: no secretstore.yaml — the platform already owns it
labels:
  - pairs: { platform.capstone/env: dev, platform.capstone/semester: "2026-fall" }
    includeSelectors: false
images:                                   # THE seam CI writes into. One entry per app, one shared tag.
  - name: paper-papas-orders-api
    newName: harbor.capstone.uamishub.com/paper-papas/paper-papas-orders-api
    newTag: "v0.0.0"                      # sentinel: "never built". CI replaces it on the first main build.
  - name: paper-papas-storefront
    newName: harbor.capstone.uamishub.com/paper-papas/paper-papas-storefront
    newTag: "v0.0.0"
  - name: paper-papas-notify
    newName: harbor.capstone.uamishub.com/paper-papas/paper-papas-notify
    newTag: "v0.0.0"
patches:
  - target: { kind: Ingress, name: paper-papas }
    patch: |-
      - { op: replace, path: /spec/rules/0/host, value: paper-papas-dev.capstone.uamishub.com }
      - { op: replace, path: /spec/tls/0/hosts, value: [paper-papas-dev.capstone.uamishub.com] }
```

Patch **both** `rules[].host` and `tls[].hosts`, or SNI and routing disagree and you get a certificate error on a host that routes fine. (Replicas stay at the base's `1` in dev; staging and prod patch them in PR 6.)

```yaml
# .devops/chart-k8s/overlays/dev/app-secret.externalsecret.yaml — declares WHERE, never WHAT
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: paper-papas-secret
  annotations:
    platform.capstone/declared-keys: "INTERNAL_API_KEY"   # key NAMES only; the Secrets tab lists these
spec:
  refreshInterval: "1h"
  secretStoreRef: { name: vault-tenant, kind: SecretStore }   # provided by the platform in every env namespace
  target: { name: paper-papas-secret, creationPolicy: Owner, deletionPolicy: Delete }
  dataFrom:
    - extract: { key: tenants/paper-papas/dev/app }   # tenants/<team>/<env>/app
```

`dataFrom: extract` pulls *every* key present at that Vault path and tolerates a missing one. The alternative — an explicit `data:` list — is **atomic**: if one named property hasn't been written yet, ESO writes *no Secret at all*, including the keys that were fine. Four tenants have been taken down by that. If you hand-add a `data:` entry, write the Vault value first, in every environment.

> **`deletionPolicy: Delete` has a sharp edge.** If the whole Vault object becomes unreadable, ESO deletes your Secret and reports `Ready=True / SecretDeleted`. Combined with `optional: true`, pods restart **Ready, serving 200s, with no secrets**, and Argo CD stays green. For a variable the app can't live without, either don't use `optional:`, or set `deletionPolicy: Retain` so the failure is loud.

```yaml
# .devops/chart-k8s/overlays/dev/database.externalsecret.yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: paper-papas-db
spec:
  refreshInterval: "1h"
  secretStoreRef: { name: vault-tenant, kind: SecretStore }
  target:
    name: paper-papas-db
    creationPolicy: Owner
    deletionPolicy: Delete
    template:
      engineVersion: v2
      data:
        # The platform creates schema+user `<team with - as _>_<env>` and writes username/password/host/port
        # to Vault. The DATABASE NAME is not in Vault; it is structural, so the DSN is assembled here.
        DATABASE_URL: "mysql://{{ .username }}:{{ .password }}@{{ .host }}:{{ .port }}/paper_papas_dev"
  data:
    - { secretKey: username, remoteRef: { key: tenants/paper-papas/dev/database, property: username } }
    - { secretKey: password, remoteRef: { key: tenants/paper-papas/dev/database, property: password } }
    - { secretKey: host,     remoteRef: { key: tenants/paper-papas/dev/database, property: host } }
    - { secretKey: port,     remoteRef: { key: tenants/paper-papas/dev/database, property: port } }
```

`team-404` → `team_404_dev`; `ss-evan-and-emily` → `ss_evan_and_emily_dev`. Hyphens become underscores.

**What goes in the Secrets tab (dev).** `INTERNAL_API_KEY` (any long random value — it must be the same for every app in that environment). ▶ `paper-papas`: also `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (runtime use only; the bundle value was baked at build), `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `APP_BASE_URL` (`https://paper-papas-dev.capstone.uamishub.com`). ▶ the other two: `STOREFRONT_SESSION_SECRET`, `STAFF_CONSOLE_SESSION_SECRET` (**two different** values), Stripe keys. Never put a real key in a ConfigMap or a committed file; `gitleaks` blocks the build if you do.

**Verify — real observations.**

```bash
kustomize build .devops/chart-k8s/overlays/dev | grep -E '^\s+(host|- host):|newTag|namespace:'
#  - every resource lands in paper-papas-dev
#  - the Ingress host is paper-papas-dev.capstone…, in rules AND tls
kustomize build .devops/chart-k8s/overlays/dev | grep -c '^kind: Ingress'     # exactly 1
```

**Must not regress.** Still only `.devops/chart-k8s/**` changes. The Ingress is named `paper-papas`. No `secretstore.yaml`, no value of any secret anywhere.

---

### (Owner step) — apply the claim

Ask now, so it's ready when PR 3 is merged. Before it's applied there is nothing for PR 4's CI to push to. See section 4 for what to ask and the two UNKNOWNs. When it lands, **confirm with your own eyes**:

- ArgoCD shows `paper-papas-dev`, `-staging`, `-prod` apps for your team (they will be red until PR 4/6 — expected).
- Harbor has a project named `<team>`.
- The Secrets tab offers dev / staging / prod for your component.

---

### PR 4 — CI builds and pushes your images; promotion map. **This is the switch.**

**Changes.**
1. Replace `.github/workflows/build-and-push.yaml` with the caller from 3.2.
2. Add `.devops/components.yaml`.
3. Rewrite `.devops/promotion.yaml`.
4. Leave `.devops/ci/validate-vm.py` where it is. Only the old workflow called it, so after step 1 it is dead but harmless; PR 10 removes it. (Side effect: the VM chart is no longer validated in CI. That is fine because you don't touch it.)

**Why.** Everything so far was inert. This PR makes the platform notice you: it builds the images and, for the first time, `promotion.yaml` points the platform at your container chart.

```yaml
# .devops/components.yaml      ▶ paper-papas (3 components). Add a staff-console block for the other two.
apiVersion: platform.capstone/v1
components:
  - name: storefront
    kind: frontend
    context: .                         # REPO ROOT — pnpm needs the whole workspace (see PR 1)
    dockerfile: apps/storefront/Dockerfile    # path is relative to `context`
    image: paper-papas-storefront      # <app>-<component>; must equal the `images[].name` in your overlays
    port: 3000
    path: /
    needsDb: false
    buildType: container
  - name: orders-api
    kind: backend
    context: .
    dockerfile: apps/orders-api/Dockerfile
    image: paper-papas-orders-api
    port: 4000
    path: ""                           # no public path = internal only
    needsDb: true
    buildType: container
  - name: notify
    kind: backend
    context: .
    dockerfile: services/notify/Dockerfile
    image: paper-papas-notify
    port: 4100
    path: ""
    needsDb: false
    buildType: container
```

The per-component language checks in CI run in `context`. With `context: .` they run at the repo root; if a check step fails for a pnpm-workspace reason that passes in your own `ci.yml`, that's information — open an issue with the failing log rather than changing `context` (the Dockerfiles need the root). **Not verified in this guide:** the central `checks` job runs `npm`, not `pnpm`; the platform has run this same pnpm-monorepo layout (`context: .`) successfully, but read your first run's `checks` log.

```yaml
# .devops/promotion.yaml
apiVersion: platform.capstone/v1
registry: harbor.capstone.uamishub.com/paper-papas
app: paper-papas
environments:
  dev:
    trigger: "branch:main"
    tagConvention: "git-describe"
    overlay: ".devops/chart-k8s/overlays/dev"
    gate: auto
  staging:
    trigger: "tag:v*"
    tagConvention: "semver"
    overlay: ".devops/chart-k8s/overlays/staging"
    gate: auto
  prod:
    trigger: "manual:promote-to-prod"
    tagConvention: "semver"
    overlay: ".devops/chart/overlays/prod"        # <-- STILL THE VM until PR 8. Do not change it.
    gate: auto
```

`gate: auto` on prod is not auto-promotion. `trigger: manual:promote-to-prod` means no git event ever writes prod's overlay; `gate` only says Argo CD syncs when the overlay changes. Staging/prod need `overlay:` and `gate:` defined or the platform's AppSet fails to render *anything* (`missingkey=error`).

Also delete the `layout: vm` line from `promotion.yaml` (it's gone from the new file above). The VM's ApplicationSet reads the same file and only needs `environments.prod.overlay` and `.gate`, both of which are still there.

**Merge order.** The claim must be applied **before** this merges. The build waits up to ~5 minutes for the platform to inject the Harbor push credential and then fails with *"Harbor push credential still not injected"* — that message means "the claim isn't applied yet / hasn't finished", not "your Dockerfile is wrong."

**Verify — real observations, in this order.** A green check on the PR proves almost nothing here.

1. **On the PR itself:** the `ci` job shows `resolve` → `scan` → `checks` (one leg per component) → `build-and-push` (one leg per component). **Count the legs:** 3 components → 3 `checks`, 3 `build-and-push`. Open a build leg and read the end of the log: `building + pushing harbor.capstone.uamishub.com/paper-papas/paper-papas-orders-api:pull-<sha>`.
2. **Harbor**: project `<team>` → you should see **one repository per component**, each with the tag from step 1. Count them.
3. **Merge to `main`.** Watch the run. `bump-dev` makes a commit by `ua-mis-ci` on `main` titled `ci: bump dev images to <tag>` and rewrites every `newTag` in `overlays/dev` from `v0.0.0`. *Open that commit's diff* and confirm all component tags are identical and match what Harbor shows.
4. **ArgoCD** → `paper-papas-dev`. Wait for **Synced**. A merged PR is not a deployment — check the Deployment actually rolled: in the resource tree open `paper-papas-orders-api` → **Live Manifest**; `metadata.generation` has advanced and `status.observedGeneration` equals it, and the container image shows the new tag.
5. **Count the pods** in the tree: expect exactly your component count, each `Running` with `1/1` ready. (If you ever see a "list the pods that aren't Running" check come back empty, remember it's equally empty when there are **zero** pods. Count first.)
6. **Pod logs** (Argo CD → pod → Logs): `orders-api`'s `migrate` init container printed `Migrations applied.`; the app printed its listen line.
7. **Exercise the endpoint**, in a **logged-in browser** (dev is SSO-gated; `curl` gets a 302 to login, which is not your app): `https://paper-papas-dev.capstone.uamishub.com/` renders the storefront, and the catalog or order list loads — that page can only render if `storefront → orders-api → MariaDB` works end to end.

**Expected red.** The `paper-papas-staging` and `-prod` Argo CD apps stay red (staging has no overlay yet; prod points at VM manifests). That's expected until PRs 6–7.

**Must not regress.** The VM still answers at `paper-papas.capstone.uamishub.com`. After the merge, `curl -sI https://paper-papas.capstone.uamishub.com/ | head -1` still returns the VM's `200`. If the VM's Argo CD app (`paper-papas-vm-prod`) goes OutOfSync, stop and ask.

---

### PR 5 — Stateful pieces: MinIO, and proving the database

**Changes.** Add a MinIO `Deployment` + `PersistentVolumeClaim` + `Service` to `chart-k8s/base`, and MinIO env to the ConfigMap/Secret.

**Why.** Your VM ran MinIO natively and your apps store order uploads in it. There is no platform-provided object store for tenants, and you must not point an app at the platform's own MinIO (it holds every namespace's backups). The owner's `crimson-copies` tenant solves this by running MinIO as a Deployment on a PVC in its own namespace (`.devops/chart/base/pvc.yaml` there carries the reasoning); do the same. A `Deployment` with an explicit PVC is simpler than a StatefulSet and is allowed by your project.

```yaml
# .devops/chart-k8s/base/pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: paper-papas-object-store
  labels: { app.kubernetes.io/name: paper-papas, app.kubernetes.io/component: object-store }
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: ceph-block
  resources: { requests: { storage: 2Gi } }     # dev's TOTAL storage quota is 5Gi; prod's is 20Gi
```

```yaml
# .devops/chart-k8s/base/object-store.yaml  (Deployment; Service and PVC beside it)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: paper-papas-object-store
  labels: { app.kubernetes.io/name: paper-papas, app.kubernetes.io/component: object-store }
spec:
  replicas: 1
  strategy: { type: Recreate }                 # RWO volume: the old pod must release it first
  selector:
    matchLabels: { app.kubernetes.io/name: paper-papas, app.kubernetes.io/component: object-store }
  template:
    metadata:
      labels: { app.kubernetes.io/name: paper-papas, app.kubernetes.io/component: object-store }
    spec:
      serviceAccountName: paper-papas
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000                           # so the non-root user can write the volume
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: minio
          image: harbor.capstone.uamishub.com/dockerhub-proxy/minio/minio:RELEASE.2025-09-07T16-13-09Z
          args: ["server", "/data", "--address", ":9000"]
          ports: [{ name: http, containerPort: 9000 }]
          env:
            - name: MINIO_ROOT_USER
              valueFrom: { secretKeyRef: { name: paper-papas-secret, key: MINIO_ROOT_USER } }
            - name: MINIO_ROOT_PASSWORD
              valueFrom: { secretKeyRef: { name: paper-papas-secret, key: MINIO_ROOT_PASSWORD } }
          readinessProbe: { httpGet: { path: /minio/health/ready, port: http }, periodSeconds: 10 }
          resources: { requests: { cpu: 50m, memory: 128Mi }, limits: { cpu: 500m, memory: 512Mi } }
          securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: [ALL] } }
          volumeMounts: [{ name: data, mountPath: /data }]
      volumes:
        - name: data
          persistentVolumeClaim: { claimName: paper-papas-object-store }
```

A `Service` named `paper-papas-object-store` (port 80 → `http`) completes it. Seal `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` in the Secrets tab (not `minioadmin`), and point the apps at it: `MINIO_ENDPOINT: "paper-papas-object-store"`, `MINIO_PORT: "80"`, `MINIO_USE_SSL: "false"` in the ConfigMap, with the apps' `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` set to the same two values. (Tag and image-pull shape are illustrative; check the MinIO release you pin is mirrored in the proxy project.)

**Browser access to uploads (this is the hard part).** On the VM, files reach a browser one of two ways: presigned MinIO URLs pointing at a hostname the browser can resolve (`team-404`'s `MINIO_PUBLIC_*`; `paper-papas`' presigned links) or Caddy proxying `/order-files/*` to MinIO (`ss-evan-and-emily`). A ClusterIP Service name like `paper-papas-object-store` is **not resolvable from a browser**; a presigned link that points at it looks real and always fails. The simplest route that keeps your code: add an Ingress path on the same host, e.g. `/order-files` → `paper-papas-object-store:9000`, and set the apps' public endpoint to your public host over HTTPS (443). Cloudflare caps request bodies at 100 MB. **Presigned URLs sign the `Host` header**, so the host the app signs must be the host the browser uses. This is the part with the most unknowns; build it last in dev, test an upload and a download from a logged-in browser, and ask for help early.

> Uploads are part of the app, so they migrate with it: this PR is not optional.

**Verify.**
- Argo CD: the object-store pod `Running 1/1`, the PVC `Bound` (not `Pending`).
- Upload a file through the storefront in dev; download it from the staff view; kill the pod (Argo CD → pod → delete) and confirm the file is **still downloadable** after the new pod is ready. That last step is the whole point of the PVC.
- DB console (`<team>-dev-db…`): tables exist; row counts move when you place an order in the UI. The tables came from the `migrate` init container — nobody ran SQL by hand.

**Must not regress.** The quota: `pvcs` and `requests.storage`. Pod count and Services count (the platform allows 15 Services/env; 5 is typical here).

---

### PR 6 — Staging and prod overlays; the first release

**Changes.** Copy `overlays/dev` to `overlays/staging` and `overlays/prod` and change: `namespace`, the Vault paths (`tenants/<team>/staging/...`), the `database` name suffix (`..._staging`, `..._prod`), host patches, image tags, replicas. Add `pdb.yaml` to staging and prod.

**Why.** Three environments are the point: staging runs the *exact image* prod will run, so surprises happen there.

Differences that matter:

| | dev | staging | prod |
| --- | --- | --- | --- |
| replicas (each app) | 1 | 2 | 2 |
| host | `<app>-dev.capstone…` | `<app>-staging.capstone…` | `<app>.capstone…` |
| `ExternalSecret` key | `tenants/<team>/dev/app` | `…/staging/app` | `…/prod/app` |
| DB name in the DSN | `…_dev` | `…_staging` | `…_prod` |
| SSO gate | yes | yes | **no, public** |

```yaml
# overlays/prod/pdb.yaml  (one per component with replicas > 1; kind-agnostic selector)
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: paper-papas-orders-api-pdb
spec:
  maxUnavailable: 1            # a node drain evicts at most one replica at a time
  selector:
    matchLabels:
      app.kubernetes.io/name: paper-papas
      app.kubernetes.io/component: orders-api
```

`surfer`'s `overlays/prod/` also contains a `rollout.yaml` (an Argo Rollouts canary). **Do not copy it.** For a multi-component app, `surfer`'s own `kustomization.yaml` never references it — it's dead code there. Your prod stays a plain Deployment. Replicas via JSON6902 `replace /spec/replicas`, as `surfer` does, not the `replicas:` builtin.

Prod must hold its **own secret values**, set in the Secrets tab for the `prod` environment — a different Stripe key (live vs test), different session secrets, and so on. A secret reused across environments is a secret that leaks from the weakest one.

Add the `staging` and `prod` entries to `images:` with the sentinel `v0.0.0` — CI's first dev build seeds the real tag into staging and prod so they come up green instead of `ImagePullBackOff`.

Now do the release. In PR 6's merge, then:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

**Verify.**
1. The tag build produces `0.1.0` (not a hash) in Harbor, all components.
2. CI's `bump-staging` commit rewrites `overlays/staging`. Argo CD `paper-papas-staging` goes **Synced** with `generation` advanced.
3. **Count** staging pods: replicas × components (paper-papas: 3 × 2 = 6, plus MinIO = 7). If you see fewer, a Deployment didn't scale; if "not Running" shows nothing, check that it isn't showing nothing because there are none.
4. Open `https://paper-papas-staging.capstone.uamishub.com/` in a logged-in browser, do a full order — the same flow you'll demo.
5. In Argo CD, `paper-papas-prod` is **still red/unused**. Do not click Promote.

**Must not regress.** Dev is still serving. The VM is still serving. `promotion.yaml` prod path unchanged.

---

### PR 7 — Data: seed dev and staging, rehearse the import, write the prod procedure

**Changes.** Add `db/seed/` (a small, idempotent `seed.sql` of *fake* data) and `docs/data-migration.md` (your dump/import procedure and the table list with your reasoning). No chart change. Run the seed into dev and staging; run the **rehearsal** described below.

**First, the model.** Every environment already has its own empty MariaDB schema; `orders-api`'s `migrate` init container builds the tables from your Drizzle migrations. So there is nothing to "copy a database" into. The question is only *which rows*, per environment:

| Env | Rows | Why |
| --- | --- | --- |
| **dev, staging** | **Seed data you wrote** (fake customers, a few catalog items, a handful of orders) | Copying prod into dev/staging spreads real customers' names, emails and addresses into places with weaker access and no reason to hold them. It's a habit worth never starting. Seed data is also reproducible: anyone can rebuild dev from git. |
| **prod** | **Selected tables from the VM**, the ones that carry real meaning | Prod must not start amnesiac about real users and orders. |

**Choosing the tables.** Open `apps/orders-api/src/db/schema.ts`. Tables in your repo:

- `paper-papas`: `users`, `catalog_items`, `orders`, `order_upload_credentials`, `order_files`, `order_events`
- `ss-evan-and-emily`: `users`, `customers`, `orders`, `order_upload_credentials`, `order_files`, `order_events`, `supply_stock`, `catalog_price_overrides`, `order_notes`
- `team-404`: `users`, `customers`, `orders`, `order_upload_credentials`, `order_files`, `order_events`, `google_identities`

For each table write one line in `docs/data-migration.md`: **import / re-create / skip, and why.** Think about: tables that are the business's own record (`orders`, `customers`, `users`, price/stock tables) → import; things you can regenerate or that are tied to the old host (upload credentials, session-ish rows) → likely re-create or skip; `order_files` rows point at MinIO objects, so they only make sense if you also move the files (below). **Do not dump `__drizzle_migrations`**: the target's `migrate` creates and owns it, and importing the VM's copy can make Drizzle think migrations ran that never did.

**The core trick: dump data only, never the schema.** *(Do not "improve" this by adding `--routines`, `--triggers`, or a full schema dump later.)* The VM runs native **MySQL**; the platform runs **MariaDB 11.8**. They have diverged. A MySQL 8 `CREATE TABLE` can carry `utf8mb4_0900_ai_ci` collations that MariaDB rejects outright, plus differences in `JSON` columns and `DEFAULT (expression)` syntax. Your Drizzle migrations already build the tables natively on MariaDB, so you sidestep all of that by importing **only `INSERT` statements** into tables the target created itself. That is the rationale: you never translate MySQL DDL into MariaDB DDL, you let each engine build its own from the same migrations. A schema dump, `--routines` or `--triggers` reintroduces exactly the divergence this avoids. Your migrations do use `JSON` (`order_events.payload_json` in two repos), `defaultNow()` timestamps and, in places, `COLLATE`/`CHARSET`/`DEFAULT (` text — read your own `drizzle/*.sql` and note which apply. (The platform team has not tested this exact path end to end. The flags below are the starting point; **verify what actually applies against your dump** and adjust.)

```bash
# On the VM (web console). Data only, named tables only, no tablespace privilege needed.
mysqldump --no-create-info --skip-triggers --no-tablespaces --skip-add-locks \
          --complete-insert --skip-comments --default-character-set=utf8mb4 \
          -u <user> -p <database> users orders customers catalog_items > /tmp/prod-data.sql
# --no-create-info : INSERTs only; the target's migrate owns the schema
# --complete-insert: names every column, so a column-order difference can't silently shift values
```

Then open `/tmp/prod-data.sql` and **read the top and a few INSERTs**. Wrap the import so foreign keys don't fire in dump order:

```sql
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;
-- ... the INSERTs ...
SET FOREIGN_KEY_CHECKS=1;
```

If an INSERT fails, the error names the table and row. Typical causes: a `JSON` value MariaDB wants as a plain string, a stray collation in an `/*!… */` conditional comment (delete it), a `0000-00-00` date. Fix the dump by hand and note the fix in `docs/data-migration.md` so the real run is a repeat, not a discovery.

**Getting the file from the VM to your laptop, and into the DB console.**
- Out of the VM: copy it over SSH (`cloudflared access ssh --hostname <team>-ssh.uamishub.com`, then `scp` through it). **Not verified for your VMs** — the browser console can't download files; if `scp` doesn't work, ask the owner rather than pasting a dump through a terminal.
- Into MariaDB: the DB console for the target environment (`https://<team>-<env>-db.capstone.uamishub.com/`, Adminer behind your team's SSO), **Import** tab. **UNKNOWN: its upload size limit.** Adminer's limit comes from the PHP upload setting and can be small. If your file is rejected for size, split it per table, gzip it (Adminer accepts `.sql.gz`), or ask the owner. Find this out in the rehearsal, not on cutover night.

**Rehearse with a scrubbed sample (this is the "do it twice" step).** Don't rehearse by copying prod into dev. Instead, on the VM, dump a *sample* — `mysqldump … --where="1 limit 20" …`, or build the sample by hand — and **scrub** names, emails, addresses before it leaves the VM (replace with fakes). Import that into **dev** exactly as you will import the real thing. That proves the dump flags, the MariaDB compatibility, the size limit and the import mechanics, using no real person's data.

**Seeding dev and staging.** Write `db/seed/seed.sql` so it can be run twice without duplicating (use `INSERT … ON DUPLICATE KEY UPDATE` or `INSERT … SELECT … WHERE NOT EXISTS`). Import it into dev and staging through the console. Never put a real password or real email in it; if your app has a login-only user table, seed fake accounts whose credentials are obviously fake **and never seed them into prod** (prod is public). An `initContainer` that runs the seed only in dev/staging overlays is a valid, more automated alternative; the console import is fine for this assignment.

**MinIO files** are the other half of "data". `order_files` rows are only meaningful if the objects exist. For prod: list what's in the VM's bucket, copy it with the MinIO client (`mc mirror`) to a file or directly to the new MinIO once it is reachable, and verify object counts. For dev/staging, upload a couple of test files through the app.

**Verify — real observations.**
1. Rehearsal: after importing the scrubbed sample into dev, every imported table's `SELECT COUNT(*)` equals the sample's count, and the app's order list renders those rows.
2. `SELECT COUNT(*)` on the VM vs the target — **write the expected number first**, per table — and spot-check specific rows, including one with a JSON or timestamp column.
3. `SELECT MAX(id)` then create a new order in the app: the new row gets an id *above* the imported maximum (auto-increment continued).
4. Dev and staging contain **no** real person's data: scan a table for a real name or email you recognize.

**Must not regress.** The VM is not stopped or modified; a dump is read-only. Nothing real goes into git — `docs/data-migration.md` records *procedure and reasoning*, never rows, and `prod-data.sql` is never committed (add `*.sql` under a `data-dumps/` path to `.gitignore`).

---

### PR 8 — Prod comes up beside the VM, on a holding host, and receives the data

**This PR deploys prod. It needs the owner at the same time.** The VM keeps serving the real hostname throughout; users notice nothing yet.

**Before you open it (all of these):**
- Staging has run your release (`0.1.0`) and you've exercised it end to end. PR 7's rehearsal passed.
- **The owner has neutralised the VM's Argo CD app.** It reads `promotion.yaml`'s `prod.overlay`, which this PR repoints. With `prune: true` it must not be allowed to sync your new overlay. (Mechanism is the owner's call; the AppProject mismatch will likely refuse the sync but you must not rely on that.) **Do not open this PR until the owner says the VM app is safe.**
- A holding host and a maintenance window are agreed: a short period when the VM's data stops changing.

**Changes.**
1. `promotion.yaml`: `prod.overlay: ".devops/chart-k8s/overlays/prod"` (was the VM's).
2. In `overlays/prod/kustomization.yaml`, patch the Ingress host to a holding name — `paper-papas-prod-hold.capstone.uamishub.com` — instead of the real prod hostname, so there is exactly one Ingress on the real host (the VM's) while prod comes up. (Prod is public, so the hold host is reachable by anyone who guesses it, with an empty database until you import. Don't announce it.)

Then, in this order:
1. **Freeze the VM's writes** (maintenance notice; stop `cc-storefront` and `cc-staff-console` on the VM, leave MySQL up).
2. Run the real dump (PR 7 procedure) and copy MinIO objects.
3. Merge this PR, then **Actions → promote-to-prod → from: staging**. Prod pods start; `migrate` creates the empty tables.
4. Import the dump through the **prod** DB console; mirror the files into prod MinIO.

**Verify.** Argo CD `paper-papas-prod` **Synced**, `generation` advanced, pod count = replicas × components (write the number first), all `1/1`. Per-table row counts match the VM exactly. Open the **hold host** in a browser: the storefront renders real orders; sign in as a real user; place a test order; the file download works. ▶ `paper-papas`: Clerk sign-in works on the hold host — **a Clerk instance is tied to allowed origins; add the hold host in the Clerk dashboard and remove it later.** Stripe webhooks: not yet (the endpoint still points at the real host).

**Rollback.** Revert the `promotion.yaml` line; unfreeze the VM (start the stopped services). Nothing was lost because the VM was never modified beyond stopping two services.

**Must not regress.** The real hostname still answers from the VM (`curl -sI https://paper-papas.capstone.uamishub.com/ | head -1` returns the VM's 200 — unfreeze it if you need it to). `overlays/staging` and `overlays/prod` carry the *same* image tag.

---

### PR 9 — The flip: the real hostname moves to Kubernetes

**Needs the owner, same session.** The owner removes the VM's Ingress (or the whole VM Argo CD app) so two Ingresses don't claim one hostname from different namespaces. **Do not delete the VM.** Keep it stopped as your rollback.

**Changes.** Remove the holding-host patch from `overlays/prod` so the Ingress serves `paper-papas.capstone.uamishub.com`.

**Verify — most-informative first.**
1. Argo CD `paper-papas-prod` Synced; Ingress shows the real host.
2. From a terminal (prod is public so `curl` is meaningful): `curl -sI https://paper-papas.capstone.uamishub.com/ | head -1` is `200`, and the response has no Caddy `Server:` header. Argo CD pod logs show *your request arriving*.
3. A real order in a browser, start to finish. ▶ `paper-papas`: Clerk sign-in; update the Clerk allowed-origins if needed. Update the **Stripe webhook** URL if the endpoint changed; a delivery in the Stripe dashboard shows **200**. (Webhooks can only be tested here — dev/staging are behind SSO.)
4. The row you just created is in the prod DB console.

**Rollback.** Re-add the holding-host patch; the owner restores the VM's Ingress and you restart its services. Possible only because the VM still exists.

**Must not regress.** The prod tag equals staging's tag. Nobody edited the VM chart.

---

### PR 10 — Retire the VM (last, only after prod is verified)

Run prod on Kubernetes for a period you can defend (a week of real use is a reasonable bar), then:

**Changes.**
1. `git rm -r .devops/chart` (the VM chart: `virtualmachine.yaml`, `cloud-init.yaml`, `ssh-service.yaml`, `console-service.yaml`, `console-ingress.yaml` / `components/console-public/`, the VM's `overlays/prod`).
2. `git rm -r deploy/vm .devops/vm-metadata.yaml .devops/ci/validate-vm.py`.
3. `git mv .devops/chart-k8s .devops/chart`, and update the four `overlay:` paths in `promotion.yaml` to `.devops/chart/overlays/<env>`. **Only now** is it safe: nothing reads the old `chart/` any more.
4. Rewrite `docs/manual-deploy.md` and `docs/manual-secrets.md` (they describe a VM that no longer exists), plus `catalog-info.yaml` / `mkdocs.yml` references.

Rebase right before merging: CI's `bump-dev` commits touch `overlays/dev/kustomization.yaml` and will conflict with a rename.

**Then the owner**, in `platform-infra`, removes the VM tier (`git rm` of `tenants/team-<team>/` and `tenants/_vm-claims/<team>-<team>.yaml`). On merge, Argo CD prunes the VM project, ApplicationSet and `<team>-vm-prod` namespace, and **namespace GC deletes the VM and its root-disk PVC permanently**. The VM's MySQL and MinIO data go with it. That is why this PR is last, and why you verified the data in PR 8.

**Verify.** Argo CD lists exactly three apps for your team, all **Synced** and healthy: `-dev`, `-staging`, `-prod`; no `-vm-prod`. A push to `main` still produces a `ci: bump dev images` commit pointing at `chart/overlays/dev`. `promote-to-prod` still works (try it when nothing changed — it should say so and exit green).

---

## 7. Verification discipline (this platform punishes its absence)

Every check above exists because the thing it replaces looks like proof and isn't.

| It looks like… | …but it only proves | Do this instead |
| --- | --- | --- |
| A green PR check | that the checks you ran passed | Read the artifact the check was supposed to produce (the Harbor tag, the bump commit, the rendered YAML) |
| A merged PR | that git changed | Argo CD **Synced** *and* the Deployment's `metadata.generation` advanced *and* `status.observedGeneration` caught up *and* the image tag in the live manifest is the one CI printed |
| A Pod in `Running` | that the process started | Hit the real endpoint; read the log lines the app prints; check `Ready 1/1`, not just `Running` |
| An empty list from "show me pods that aren't Running" | **nothing**: it's empty when everything is healthy *and* when there are no pods at all | **Count.** Write down the expected number first (replicas × components), then compare |
| A key present in the Secret / Vault | that the Secret has it | The container's environment is resolved at *start*. Look at pod **age** (did it restart after the secret changed?) and at app behavior. Add a startup log line printing which expected variable **names** are set (never values) and read it in the logs |
| `curl` to dev returning something | that the SSO page loaded | A 302 to login is the gate, not the app. Use a logged-in browser for dev/staging |
| ESO `Ready=True` | that a Secret exists with keys | `deletionPolicy: Delete` reports `Ready=True / SecretDeleted`. Look at the app, not the status |
| Argo CD "Healthy" with no children listed | health | Argo CD computes no health for some kinds. Open the resource and read its own status |
| "I fixed it by hand and it works" | a live read at that instant | Argo CD's `selfHeal` reverts hand edits. Durable evidence is **in git AND Synced** |

Three habits: **write the expected number before you look** (pods, tags, rows); **ask "could this check have failed?"** before you trust a pass; and **never conclude from the absence of an error** — find the positive evidence.

---

## 8. Common failures, by what you'll see

| Symptom | Likely cause |
| --- | --- |
| Argo CD refuses the whole Deployment, mentions `envFrom` | a `name:`/`value:` entry under `envFrom:` (3.4) |
| Pod `Running` but not `Ready`; probes fail; app logs look healthy | listener bound to `127.0.0.1` — set `HOST=0.0.0.0` / `HOSTNAME=0.0.0.0` |
| `CreateContainerConfigError` | a non-optional `secretKeyRef`/`secretRef` whose Secret doesn't exist yet: seal it in the Secrets tab for **that environment**, then wait one ESO refresh (about a minute) |
| `ImagePullBackOff`, "not found" | a tag nobody pushed (you typed it) or a sentinel `v0.0.0` that CI hasn't replaced |
| Pod `OOMKilled` / restarts | limits too low (Next.js outgrows the 256 Mi default) — and the cap is 1 CPU / 1 Gi per container |
| Request hangs ~30 s then fails, nothing in logs | a blocked egress (NetworkPolicy drops *time out*; only :443 outbound is open), or the Clerk dev-key self-proxy loop (PR 1) |
| Service routes to the wrong app | a selector missing `component:` |
| Certificate error on a host that routes | patched `rules[].host` but not `tls[].hosts` |
| dev/staging reachable without login | the Ingress isn't named exactly your app name |
| Secrets-tab value "ignored" | an explicit `env:` entry shadows it, or the pod hasn't restarted since you sealed it |
| `bump-dev` fails: "overlay kustomization not found" | `promotion.yaml` `overlay:` path doesn't match a real directory |
| Build: "Harbor push credential still not injected" | the claim isn't applied yet / still provisioning (section 4) — not your Dockerfile |
| Two ArgoCD apps fighting over an object | you shipped a `secretstore.yaml`; delete it, the platform owns it |

When stuck, bring the Argo CD app link, the CI run link, and the exact error — not a description.
