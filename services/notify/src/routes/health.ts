import type { FastifyInstance } from 'fastify';

/** Public, unauthenticated infra probe -- bare process liveness. */
export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/healthz', async (_request, reply) => {
    return reply.code(200).send({ status: 'ok' });
  });
}
