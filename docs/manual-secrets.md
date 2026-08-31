# Manual secrets (VM phase)

Each service's `.env` at `/opt/crimsoncopies/<service>/.env` is rendered once
(never overwritten by a deploy -- see `docs/manual-deploy.md`) from that service's
own `.env.example` (`apps/orders-api/.env.example`, etc.) with real values filled
in by hand.

Generate `INTERNAL_API_KEY` once and paste the SAME value into every service's
`.env`:

```bash
openssl rand -hex 32   # INTERNAL_API_KEY -- identical across every service
```

Generate a separate `SESSION_SECRET` per web app (`storefront` and `staff-console`
each get their OWN value -- never share one between them, since a leaked secret for
one app should never let someone forge sessions for the other):

```bash
openssl rand -hex 32   # SESSION_SECRET -- unique per web app
```

Never commit a real `.env` -- every `.env` filename is gitignored (`.gitignore` at
the repo root).
