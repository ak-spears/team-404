import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * The internal header pair: `orders-api` never verifies a session itself, only
 * `X-Internal-Key` (a shared secret, checked below) plus `X-User-Role`/`X-User-Id` (set by the
 * calling BFF after it verified the caller's session server-side). This route is assumed to be
 * bound to a network boundary the browser cannot reach (see config.ts HOST) -- the header pair
 * is trusted only because of that boundary, not because it is itself unforgeable.
 */
export interface InternalUser {
  role?: 'customer' | 'staff';
  id?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    internalUser: InternalUser;
  }
}

const VALID_ROLES = new Set<InternalUser['role']>(['customer', 'staff']);

/**
 * Constant-time string comparison for the shared internal-key boundary the whole design rests
 * on. A length mismatch still runs a same-length comparison (against `a` itself) rather than
 * returning immediately, so a mismatched length doesn't leak via timing either (pattern from
 * ssh2's own README auth example).
 */
function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  const lengthsMatch = bufA.length === bufB.length;
  // Always run the constant-time comparison, even on a length mismatch (against `a` itself), so
  // the length-mismatch path can't be distinguished by timing from a same-length near-miss.
  const isMatch = timingSafeEqual(bufA, lengthsMatch ? bufB : bufA);
  return lengthsMatch && isMatch;
}

/** Registers the `internalUser` decorator so Fastify treats it as a known request property. */
export function registerInternalAuthDecorator(app: FastifyInstance): void {
  app.decorateRequest('internalUser', null as unknown as InternalUser);
}

/**
 * Builds the preHandler that enforces `X-Internal-Key` and parses the optional
 * `X-User-Role`/`X-User-Id` pair onto `request.internalUser`. Missing/unrecognized role or id
 * headers are left `undefined` rather than rejected -- not every caller can send them (guest
 * orders have no session), and routes decide for themselves whether an absent identity means
 * "deny" or "treat as anonymous" (see routes/orders.ts).
 */
export function createRequireInternalKey(internalApiKey: string) {
  return async function requireInternalKey(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const providedKey = request.headers['x-internal-key'];
    if (typeof providedKey !== 'string' || !timingSafeEqualString(providedKey, internalApiKey)) {
      await reply.code(401).send({ error: 'unauthorized' });
      return;
    }

    const rawRole = request.headers['x-user-role'];
    const role =
      typeof rawRole === 'string' && VALID_ROLES.has(rawRole as InternalUser['role'])
        ? (rawRole as InternalUser['role'])
        : undefined;
    const rawId = request.headers['x-user-id'];
    const id = typeof rawId === 'string' ? rawId : undefined;

    request.internalUser = { role, id };
    console.log('INTERNAL AUTH:', {
    role,
    id,
    path: request.url,
    });
  };
}
