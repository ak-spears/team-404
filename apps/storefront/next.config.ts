import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Self-hosted `node .next/standalone/server.js`, no platform coupling.
  output: 'standalone',
  // Rooted at the pnpm workspace root (not this app's own dir) so file tracing follows pnpm's
  // symlinked node_modules out to the real `.pnpm` store and picks up `@crimson-copies/shared`
  // correctly -- the standard fix for Next.js standalone output inside a pnpm monorepo. This
  // means the emitted server lands at `.next/standalone/apps/storefront/server.js`, not a flat
  // `.next/standalone/server.js`; the deploy step must `cp -r public` and `cp -r .next/static`
  // into that nested `apps/storefront/` dir before running it, same as Next's own documented
  // monorepo Docker example.
  outputFileTracingRoot: path.join(__dirname, '../..'),
};

export default nextConfig;
