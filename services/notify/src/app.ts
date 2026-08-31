import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { registerHealthRoute } from './routes/health.js';
import { registerSendRoute } from './routes/send.js';

export interface BuildAppOptions {
  config: Config;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  // Fastify's own request/error logging is off; every log line here is a plain
  // console.log/console.error call instead.
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, request, reply) => {
    if (error.validation || (error.statusCode && error.statusCode < 500)) {
      return reply.send(error);
    }
    console.error('unhandled error', error);
    return reply.code(503).send({ error: 'service_unavailable' });
  });

  registerHealthRoute(app);
  registerSendRoute(app, { config: options.config });

  return app;
}
