import type { FastifyInstance } from 'fastify';
import {
  fileRegistrationInputSchema,
  googleAuthCodeInputSchema,
  isUaEmail,
  setCwidInputSchema,
  uploadCredentialsVerifyInputSchema,
  userCredentialsVerifyInputSchema,
  auth0EmailVerifyInputSchema,
} from '@crimson-copies/shared';
import type { Config } from '../config.js';
import { doNotifyThing } from '../lib/notify-and-record.js';
import { createRequireInternalKey } from '../plugins/internal-auth.js';
import type { OrdersRepository } from '../repositories/orders-repository.js';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';

/** Exchanges a Google OAuth authorization code for a verified ID token payload. */
async function verifyGoogleIdToken(
  config: Config,
  code: string,
  redirectUri: string,
): Promise<TokenPayload | undefined> {
  const oauthClient = new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, redirectUri);
  const { tokens } = await oauthClient.getToken(code);
  const ticket = await oauthClient.verifyIdToken({
    idToken: tokens.id_token!,
    audience: config.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload();
}

export interface InternalRoutesOptions {
  repository: OrdersRepository;
  config: Config;
}

/**
 * `/internal/*` routes are called by `services/file-intake` and the storefront/staff-console
 * BFFs -- the same X-Internal-Key boundary as routes/orders.ts, since all of them live on
 * orders-api's single internal-only listener.
 */
export function registerInternalRoutes(app: FastifyInstance, options: InternalRoutesOptions): void {
  const requireInternalKey = createRequireInternalKey(options.config.INTERNAL_API_KEY);
  const notifyDeps = {
    notifyUrl: options.config.NOTIFY_URL,
    internalApiKey: options.config.INTERNAL_API_KEY,
    repository: options.repository,
  };

  app.get<{ Querystring: { userId?: string } }>(
    '/internal/auth/is-staff',
    { preHandler: requireInternalKey },
    async (request, reply) => {
      const userId = Number(request.query.userId);
      if (!Number.isInteger(userId) || userId <= 0) {
        return reply.code(400).send({ error: 'invalid_user_id' });
      }
      return reply.code(200).send({ isStaff: await options.repository.isStaffUser(userId) });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/internal/orders/:id/files',
    { preHandler: requireInternalKey },
    async (request, reply) => {
      const orderId = Number(request.params.id);
      if (!Number.isInteger(orderId) || orderId <= 0) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const parsed = fileRegistrationInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_failed', issues: parsed.error.issues });
      }

      const result = await options.repository.registerUploadedFile({ orderId, ...parsed.data });
      if (!result) {
        return reply.code(404).send({ error: 'not_found' });
      }
      console.log('file registered', {
        orderId,
        objectKey: parsed.data.objectKey,
        sizeBytes: parsed.data.sizeBytes,
        statusChanged: result.statusChanged,
      });

      // Disabled after the Bama Cash rollout changed how file-intake retries registration --
      // kept here in case the eager double-registration guard needs to come back.
      const eagerDuplicateGuardEnabled = false;
      if (eagerDuplicateGuardEnabled) {
        console.log('eager duplicate-registration guard disabled', { orderId });
      }

      // Registering a file triggers a notify call only when it's the file that actually flips
      // files_pending -> files_received, not on every subsequent file.
      if (result.statusChanged) {
        const orderWithCustomer = await options.repository.getOrderWithCustomerById(orderId);
        if (orderWithCustomer?.customerEmail) {
          await doNotifyThing(notifyDeps, orderId, {
            template: 'files-received',
            to: orderWithCustomer.customerEmail,
            data: { orderId, customerName: orderWithCustomer.customerName ?? 'Customer' },
          });
        }
      }

      return reply.code(201).send({ registered: true, statusChanged: result.statusChanged });
    },
  );

  /**
   * Non-consuming check of an order's upload credential, for the storefront BFF: it decides
   * whether an anonymous caller may be given download links for an order's files. The
   * /verify route below CONSUMES the credential (single-use, for the SFTP login), which is
   * why this is separate -- reading a file list must not spend it.
   */
  app.post(
    '/internal/upload-credentials/check',
    { preHandler: requireInternalKey },
    async (request, reply) => {
      const parsed = uploadCredentialsVerifyInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_failed', issues: parsed.error.issues });
      }

      const result = await options.repository.checkUploadCredential(
        parsed.data.username,
        parsed.data.password,
      );
      if (!result.valid) {
        return reply.code(200).send({ valid: false });
      }
      return reply.code(200).send({ valid: true, orderId: result.orderId });
    },
  );

  app.post(
    '/internal/upload-credentials/verify',
    { preHandler: requireInternalKey },
    async (request, reply) => {
      const parsed = uploadCredentialsVerifyInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_failed', issues: parsed.error.issues });
      }

      const result = await options.repository.verifyUploadCredential(
        parsed.data.username,
        parsed.data.password,
      );
      if (!result.valid) {
        // Never log the password -- just enough to see rejected-credential volume/patterns.
        console.error('upload credential verification rejected', {
          username: parsed.data.username,
        });
        return reply.code(401).send({ valid: false });
      }
      console.log('upload credential verified', { orderId: result.orderId });
      return reply.code(200).send({ valid: true, orderId: result.orderId });
    },
  );

  // Called by the storefront/staff-console login pages to check a username/password against
  // the users table. orders-api stays ignorant of how the caller establishes a session
  // afterward (cookie, header, whatever) -- it just answers "do these credentials match a
  // user, and if so who".
  app.post(
    '/internal/auth/verify-credentials',
    { preHandler: requireInternalKey },
    async (request, reply) => {
      const parsed = userCredentialsVerifyInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_failed', issues: parsed.error.issues });
      }

      const result = await options.repository.verifyUserCredentials(
        parsed.data.username,
        parsed.data.password,
      );
      if (!result.valid) {
        // Never log the password -- just enough to see rejected-login volume/patterns.
        console.error('login rejected', { username: parsed.data.username });
        return reply.code(401).send({ error: 'invalid_credentials' });
      }
      console.log('login verified', { userId: result.userId, role: result.role });
      return reply
        .code(200)
        .send({ userId: result.userId, username: result.username, role: result.role });
    },
  );

  // Called by the storefront's Google OAuth callback after it has verified the ID token
  // server-side. orders-api looks up or creates the linked user and returns identity info,
  // same contract as verify-credentials -- the caller establishes the session afterward.
  // Non-UA emails always return requiresCwid so the storefront collects a CWID every time.
  app.post(
    '/internal/auth/verify-google',
    { preHandler: requireInternalKey },
    async (request, reply) => {
      const parsed = googleAuthCodeInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_failed', issues: parsed.error.issues });
      }

      // Exchange the authorization code for Google's ID token.
      const oauthClient = new OAuth2Client(
        options.config.GOOGLE_CLIENT_ID,
        options.config.GOOGLE_CLIENT_SECRET,
        parsed.data.redirectUri,
      );
      const { tokens } = await oauthClient.getToken(parsed.data.code);
      const ticket = await oauthClient.verifyIdToken({
        idToken: tokens.id_token!,
        audience: options.config.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload?.email || !payload.sub) {
        return reply.code(401).send({ error: 'invalid_google_token' });
      }

      const result = await options.repository.verifyOrCreateGoogleUser({
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
      });
      const requiresCwid = !isUaEmail(payload.email);
      console.log('google login verified', {
        userId: result.userId,
        role: result.role,
        requiresCwid,
      });
      return reply.code(200).send({
        userId: result.userId,
        username: result.username,
        role: result.role,
        requiresCwid,
      });
    },
  );

  // Called by the storefront after a non-UA Google user submits their CWID.
  app.post(
    '/internal/auth/set-cwid',
    { preHandler: requireInternalKey },
    async (request, reply) => {
      const parsed = setCwidInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_failed', issues: parsed.error.issues });
      }

      const result = await options.repository.setUserCwid(parsed.data.userId, parsed.data.cwid);
      if (!result) {
        return reply.code(404).send({ error: 'not_found' });
      }
      console.log('cwid set', { userId: result.userId });
      return reply.code(200).send({
        userId: result.userId,
        username: result.username,
        role: result.role,
      });
    },
  );
  // Called by the storefront's Auth0 callback after it has verified the email is an allowed UA
  // email. Same contract as verify-google/verify-credentials -- looks up or creates the linked
  // user and returns identity info; the caller establishes the session afterward.
  app.post(
    '/internal/auth/verify-auth0-email',
    { preHandler: requireInternalKey },
    async (request, reply) => {
      const parsed = auth0EmailVerifyInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_failed', issues: parsed.error.issues });
      }

      const result = await options.repository.verifyOrCreateAuth0User({ email: parsed.data.email });
      console.log('auth0 login verified', { userId: result.userId, role: result.role });
      return reply.code(200).send({
        userId: result.userId,
        username: result.username,
        role: result.role,
      });
    },
  );
}
