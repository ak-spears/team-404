import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from '@neondatabase/serverless';
import type { Config } from './config.js';
import type { Db } from './db/client.postgres.js';
import { registerInternalAuthDecorator } from './plugins/internal-auth.js';
import { createOrdersRepository, type OrdersRepository } from './repositories/orders-repository.postgres.js';
import { registerHealthRoute } from './routes/health.postgres.js';
import { registerOrdersRoutes } from './routes/orders.js';
import { registerInternalRoutes } from './routes/internal.js';

export interface BuildAppOptions {
  config: Config;
  db: Db;
  pool: Pool;
  repository?: OrdersRepository;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  registerInternalAuthDecorator(app);

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