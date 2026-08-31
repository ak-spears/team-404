import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Self-hosted `node .next/standalone/server.js`, no platform coupling.
  output: 'standalone',
  // See apps/storefront/next.config.ts for why this is rooted at the pnpm workspace root rather
  // than this app's own dir (pnpm symlinked node_modules + `@crimson-copies/shared` tracing).
  outputFileTracingRoot: path.join(__dirname, '../..'),
};

export default nextConfig;
