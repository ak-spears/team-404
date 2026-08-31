import type { FastifyInstance } from "fastify";
import { notifySendInputSchema } from "@crimson-copies/shared";
import type { Config } from "../config.js";
import { createRequireInternalKey } from "../plugins/internal-auth.js";

export interface SendRouteOptions {
  config: Config;
}

/**
 * `POST /internal/send` -- orders-api's only entry point into email. Stub: logs the attempt and
 * returns 202 without actually delivering anything.
 */
export function registerSendRoute(app: FastifyInstance, options: SendRouteOptions): void {
  const requireInternalKey = createRequireInternalKey(options.config.INTERNAL_API_KEY);

  app.post("/internal/send", { preHandler: requireInternalKey }, async (request, reply) => {
    const parsed = notifySendInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_failed", issues: parsed.error.issues });
    }

    console.log(`[stub] would send ${parsed.data.template} to ${parsed.data.to}`);
    return reply.code(202).send({ queued: true });
  });
}
