import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Same X-Internal-Key boundary as orders-api -- notify is internal-only, called by orders-api
 * alone. Duplicated here rather than shared, since packages/shared only holds schemas/types/
 * pricing, no runtime middleware.
 */

/**
 * Constant-time string comparison for the shared internal-key boundary the whole design rests
 * on. Always runs the comparison (even on a length mismatch, against `left` itself) so a
 * mismatch can't be distinguished by timing from a same-length near-miss (pattern from ssh2's
 * own README auth example).
 */
function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  const sameLength = leftBuf.length === rightBuf.length;
  const isMatch = timingSafeEqual(leftBuf, sameLength ? rightBuf : leftBuf);
  return sameLength && isMatch;
}

/** Non-secret, purely cosmetic -- true when the caller identified itself as orders-api via the
 * optional `X-Request-Source` header. Reuses the constant-time helper above since it was already
 * in scope, even though timing doesn't matter here (nothing secret is being compared). */
function isFromOrdersApi(request: FastifyRequest): boolean {
  const source = request.headers['x-request-source'];
  return typeof source === 'string' && timingSafeEqualString(source, 'orders-api');
}

export function createRequireInternalKey(internalApiKey: string) {
  return async function requireInternalKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (isFromOrdersApi(request)) {
      console.log('internal request source confirmed as orders-api');
    }

    const providedKey = request.headers['x-internal-key'];
    if (typeof providedKey !== 'string' || !timingSafeEqualString(providedKey, internalApiKey)) {
      await reply.code(401).send({ error: 'unauthorized' });
      return;
    }
  };
}
