import type { FastifyInstance } from 'fastify';
import type { Pool } from '@neondatabase/serverless';

/**
 * Public, unauthenticated infra probe. Verifies real DB connectivity rather than just process
 * liveness, so a probe failure is a signal worth waking someone up for.
 */
export function registerHealthRoute(app: FastifyInstance, pool: Pool): void {
  app.get('/healthz', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return reply.code(200).send({ status: 'ok' });
    } catch (err) {
      console.error('healthz DB check failed', err);
      return reply.code(503).send({ status: 'error' });
    }
  });
}