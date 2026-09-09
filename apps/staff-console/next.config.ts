import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Self-hosted `node .next/standalone/server.js`, no platform coupling.
  output: 'standalone',
  // Mounted under /staff on the team's single public hostname. The VM has one hostname and the
  // wildcard cert covers only one label, so a `staff.` subdomain can't get a certificate -- a
  // path prefix is the only public route (docs/architecture.md sec. 1). Caddy sends /staff* here
  // (deploy/vm/Caddyfile) and this makes Next emit every route, asset and redirect under /staff
  // so nothing collides with the storefront at /. Keep in sync with src/lib/base-path.ts.
  basePath: '/staff',
  // See apps/storefront/next.config.ts for why this is rooted at the pnpm workspace root rather
  // than this app's own dir (pnpm symlinked node_modules + `@crimson-copies/shared` tracing).
  outputFileTracingRoot: path.join(__dirname, '../..'),
};

export default nextConfig;
