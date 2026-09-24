import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'mysql2/promise';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { MAX_UPLOAD_BYTES } from './lib/storage.js';
import { registerInternalAuthDecorator } from './plugins/internal-auth.js';
import { createOrdersRepository, type OrdersRepository } from './repositories/orders-repository.js';
import { registerHealthRoute } from './routes/health.js';
import { registerInternalRoutes } from './routes/internal.js';
import { registerOrdersRoutes } from './routes/orders.js';

export interface BuildAppOptions {
  config: Config;
  db: Db;
  pool: Pool;
  /** Injectable for tests -- defaults to the real Drizzle-backed repository. */
  repository?: OrdersRepository;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  // Fastify's own request/error logging is off; every log line in this codebase is a plain
  // console.log/console.error call instead.
  const app = Fastify({ logger: false });

  registerInternalAuthDecorator(app);

  // Customer file uploads (POST /api/orders/:id/files) arrive as multipart. One file per
  // request, size-capped on the stream so an oversized upload is cut off mid-flight rather
  // than buffered whole and rejected afterwards.
  app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  // No raw SQL/error detail ever reaches a client response. Validation errors and other
  // deliberate <500s pass through as-is; everything else is logged and collapsed to a generic
  // 503.
  app.setErrorHandler((error, request, reply) => {
    if (error.validation || (error.statusCode && error.statusCode < 500)) {
      return reply.send(error);
    }
    console.error('unhandled error', error);
    return reply.code(503).send({ error: 'service_unavailable' });
  });

  const repository =
    options.repository ?? createOrdersRepository(options.db, options.config.BCRYPT_ROUNDS);

  registerHealthRoute(app, options.pool);
  registerOrdersRoutes(app, { repository, config: options.config });
  registerInternalRoutes(app, { repository, config: options.config });

  return app;
}
