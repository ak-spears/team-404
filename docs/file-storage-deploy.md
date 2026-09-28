# Deploying file storage to the VM

Everything below runs **on the VM** (<https://team-404-console.uamishub.com>, sign in with
GitHub, you land as `ubuntu`). Nothing here happens automatically: pushing to GitHub does not
touch the VM.

Do the four setup steps **before** the deploy. If you deploy first, the site comes up with
uploads returning 503 and download links pointing at `localhost` — it looks fine until someone
tries to use it.

---

## 1. Check what MinIO's root credentials actually are

The app config defaults to `minioadmin`/`minioadmin`, which is probably **not** what this VM
uses. Find the real values before anything else:

```bash
sudo systemctl show minio -p Environment
sudo cat /etc/default/minio 2>/dev/null || sudo cat /etc/minio/minio.conf 2>/dev/null
```

Everything below assumes you now have the root user and password, and that `mc` is installed
(`mc --version`; if missing, `curl https://dl.min.io/client/mc/release/linux-amd64/mc -o mc`
and `chmod +x mc`).

```bash
mc alias set local http://127.0.0.1:9000 <root-user> <root-password>
mc ls local            # the order-files bucket should be listed
```

orders-api creates the bucket at boot if it is missing, so an empty listing is not a problem.

## 2. Create the read-only accounts

The web apps only ever read. Give each its own scoped account rather than handing them root:

```bash
cat > /tmp/order-files-read.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:GetObject"], "Resource": ["arn:aws:s3:::order-files/*"] }
  ]
}
JSON

mc admin policy create local order-files-read /tmp/order-files-read.json
mc admin user add local staff-console "$(openssl rand -hex 16)"     # note the secret down
mc admin user add local storefront "$(openssl rand -hex 16)"        # note this one too
mc admin policy attach local order-files-read --user staff-console
mc admin policy attach local order-files-read --user storefront
```

Separate accounts mean a leak in one app can be revoked without disturbing the other.

## 3. Fill in the service environment files

`/etc/capstone/env/orders-api.env` — the only writer, so it gets the **root** credentials:

```
MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=<root-user>
MINIO_SECRET_KEY=<root-password>
MINIO_BUCKET=order-files
```

`/etc/capstone/env/staff-console.env` and `/etc/capstone/env/storefront.env` — read-only
account each, plus where the browser will fetch from:

```
MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=staff-console        # or storefront, in the storefront's file
MINIO_SECRET_KEY=<that account's secret>
MINIO_BUCKET=order-files

MINIO_PUBLIC_ENDPOINT=team-404.capstone.uamishub.com
MINIO_PUBLIC_USE_SSL=true
```

`MINIO_PUBLIC_*` is not optional decoration. A presigned URL is signed **for a specific host**
(SigV4 covers the `Host` header), so a link signed for `127.0.0.1` cannot be rewritten to the
public hostname afterwards — it just fails the signature check. Without these, every download
link points at the staff member's own machine.

## 4. Install the Caddy route

The VM's Caddy loads `/etc/capstone/Caddyfile`, which is **not** the file in this repo. Add the
`/order-files/*` route from `deploy/vm/Caddyfile` to it — before the catch-all storefront
handler — then:

```bash
sudo caddy validate --adapter caddyfile --config /etc/capstone/Caddyfile
sudo systemctl reload caddy
```

MinIO uses path-style addressing, so the bucket name *is* the first path segment. Caddy must
pass the incoming `Host` through unchanged, which is its default — do not set `header_up Host`.

## 5. Deploy

```bash
cd ~/team-404
git pull
sudo capstone-app-deploy ~/team-404
```

Roughly half an hour on this hardware. It builds, runs migrations, publishes to
`/opt/crimsoncopies/` and restarts the `cc-*` units. Two migrations land here: an additive enum
change on `order_files.uploaded_via`, and a guarded `users.cwid` column that no earlier
migration ever created.

## 6. Verify, in this order

```bash
journalctl -u cc-orders-api -n 50          # "created MinIO bucket" or silence = fine
                                           # "MinIO bucket check failed" = step 1 or 3 is wrong
```

Then in a browser: place an order on the live site with a file attached, and confirm the file
appears in the order's file list and opens when clicked.

```bash
mc ls --recursive local/order-files        # the object should be here
```

If the upload returns 503, orders-api cannot reach MinIO — check its credentials in
`/etc/capstone/env/orders-api.env` and restart it. If the upload works but the link 404s or
403s, the Caddy route (step 4) or `MINIO_PUBLIC_*` (step 3) is the problem.

---

## Known gaps

- **staff-console has no public route yet.** Downloads work, but there is nowhere on the public
  site to click them until the `/staff` path prefix is served. Storefront-side preview does
  work, so a customer can open their own file.
- **No quota or retention.** Uploads share the VM's 30 GB disk with MySQL and MinIO, and
  nothing prunes files for completed orders. Worth watching `df -h` and adding a retention rule
  before this sees real use.
- **Guests can read any order.** `GET /api/orders/:id` and its file list treat an unidentified
  caller as a guest and allow it, and order ids are sequential. Uploads are no longer affected
  (they require a session or the order's upload credential), but reads still are. Fixing it
  means breaking the emailed-link guest flow, so it is a product decision, not a patch.
