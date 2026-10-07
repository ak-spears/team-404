import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  isValidStatusTransition,
  type OrderEventActor,
  type OrderStatus,
  type PaymentMethod,
  type ServiceType,
  type UploadMethod,
} from '@crimson-copies/shared';
import { calculatePriceCents } from '@crimson-copies/shared';
import type { Db } from '../db/client.js';
import { customers, googleIdentities, orderEvents, orderFiles, orders, orderUploadCredentials, users } from '../db/schema.js';

const UPLOAD_CREDENTIAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface OrderRecord {
  id: number;
  customerId: number | null;
  assignedTo: number | null;
  serviceType: ServiceType;
  quantity: number;
  specNotes: string | null;
  paymentMethod: PaymentMethod;
  priceCents: number | null;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  pickupReadyAt: Date | null;
  completedAt: Date | null;
}

export interface OrderWithCustomer extends OrderRecord {
  customerName: string | null;
  customerEmail: string | null;
  userId: number | null;
}

export interface CreateOrderParams {
  customerName: string;
  customerEmail: string;
  customerPhone?: string | undefined;
  serviceType: ServiceType;
  quantity: number;
  specNotes?: string | undefined;
  paymentMethod: PaymentMethod;
  /**
   * The signed-in user id from the trusted `X-User-Id` header -- absent for guest orders,
   * present once the calling BFF has verified a local session. orders-api stays ignorant of how
   * that session was established (cookie, header, whatever the web layer uses); this is just an
   * id it links customers by.
   */
  userId?: number | undefined;
}

export interface UploadInstructionsResult {
  username: string;
  plaintextPassword: string;
  expiresAt: Date;
}

export interface CreateOrderResult {
  order: OrderRecord;
  uploadCredential: UploadInstructionsResult;
}

export interface ListOrdersFilter {
  status?: OrderStatus | undefined;
  assignedTo?: number;

  /** Filters to orders belonging to the customer linked to this user id. */
  userId?: number | undefined;
}

export interface RegisterUploadedFileParams {
  orderId: number;
  objectKey: string;
  originalFilename: string;
  sizeBytes: number;
  /** How the bytes arrived. Defaults to the column default ('sftp') when omitted. */
  uploadedVia?: UploadMethod;
}

export interface RegisterUploadedFileResult {
  order: OrderRecord;
  /** True when this file registration was the one that flipped files_pending -> files_received. */
  statusChanged: boolean;
}

export type VerifyUploadCredentialResult = { valid: true; orderId: number } | { valid: false };

export type VerifyUserCredentialsResult =
  | { valid: true; userId: number; username: string; role: 'customer' | 'staff' }
  | { valid: false };

export interface UpdateOrderStatusParams {
  orderId: number;
  status: OrderStatus;
  actor: OrderEventActor;
}

/** Thrown by `updateOrderStatus` when `status` isn't reachable from the order's current status. */
export class InvalidStatusTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(`Cannot transition order from '${from}' to '${to}'`);
    this.name = 'InvalidStatusTransitionError';
  }
}

export interface OrderFileRecord {
  id: number;
  objectKey: string;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: Date;
}

export interface OrdersRepository {
  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  getOrderById(id: number): Promise<OrderRecord | null>;
  getOrderWithCustomerById(id: number): Promise<OrderWithCustomer | null>;
  listOrders(filter: ListOrdersFilter): Promise<OrderRecord[]>;
  /** `order_files` rows for an order, oldest first -- staff-console presigns MinIO GETs from `objectKey`. */
  listOrderFiles(orderId: number): Promise<OrderFileRecord[]>;
  /** One file, only if it belongs to `orderId` -- a file id alone never identifies a file. */
  getOrderFile(orderId: number, fileId: number): Promise<OrderFileRecord | null>;
  registerUploadedFile(params: RegisterUploadedFileParams): Promise<RegisterUploadedFileResult | null>;
  verifyUploadCredential(username: string, password: string): Promise<VerifyUploadCredentialResult>;
  /**
   * Non-consuming variant of the above, for the web upload path: it proves the caller holds
   * the credential this order was created with, without burning it -- one order normally has
   * several files, and the single-use rule exists for the SFTP login, not for authorizing an
   * upload. Expiry still applies.
   */
  checkUploadCredential(username: string, password: string): Promise<VerifyUploadCredentialResult>;
  verifyUserCredentials(username: string, password: string): Promise<VerifyUserCredentialsResult>;

  /** Looks up a user by their linked Google account, creating a new customer account on first sign-in. */
  verifyOrCreateGoogleUser(input: {
    googleId: string;
    email: string;
    name?: string;
  }): Promise<{ valid: true; userId: number; username: string; role: 'customer' | 'staff' }>;

  /** Looks up a user by their verified Auth0 email, creating a new customer account on first sign-in. */
  verifyOrCreateAuth0User(input: {
    email: string;
  }): Promise<{ valid: true; userId: number; username: string; role: 'customer' | 'staff' }>;

  /** Stores a CWID on the user. Always overwrites (non-UA Google logins re-collect every time). */
  setUserCwid(userId: number, cwid: string): Promise<{ userId: number; username: string; role: 'customer' | 'staff' } | null>;

  updateOrderStatus(params: UpdateOrderStatusParams): Promise<OrderRecord | null>;

  /** Generic append-only audit trail write (order_events). */
  recordEvent(
    orderId: number,
    eventType: string,
    actor: OrderEventActor,
    payload?: Record<string, unknown>,
  ): Promise<void>;
}


/**
 * Generates a one-time SFTP upload password. Not a bcrypt input constraint -- just needs to be
 * hard to guess and easy enough for a customer to paste into an SFTP client. One-time,
 * per-order, bcrypt-hashed at rest, 7-day expiry.
 */
function generateUploadPassword(): string {
  return randomBytes(18).toString('base64url');
}

export function createOrdersRepository(db: Db, bcryptRounds: number): OrdersRepository {
  async function getOrderById(id: number): Promise<OrderRecord | null> {
    const [row] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return row ?? null;
  }

  async function recordEvent(
    orderId: number,
    eventType: string,
    actor: OrderEventActor,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await db.insert(orderEvents).values({
      orderId,
      eventType,
      actor,
      payloadJson: payload ?? null,
    });
  }

  return {
    async createOrder(params) {
      const priceCents = calculatePriceCents(params.serviceType, params.quantity);
      const plaintextPassword = generateUploadPassword();
      const passwordHash = await bcrypt.hash(plaintextPassword, bcryptRounds);
      const expiresAt = new Date(Date.now() + UPLOAD_CREDENTIAL_TTL_MS);

      const orderId = await db.transaction(async (tx) => {
        // When the BFF has verified a local session, X-User-Id links this order to a
        // persistent customer identity (find-or-create by user_id, which db/schema.ts declares
        // UNIQUE); with no session, every order is a guest order -- a fresh customer row with
        // user_id left null, since orders itself has no columns for contact info.
        let customerId: number;
        if (params.userId) {
          const [existing] = await tx
            .select()
            .from(customers)
            .where(eq(customers.userId, params.userId))
            .limit(1);
          if (existing) {
            customerId = existing.id;
          } else {
            try {
              const [inserted] = await tx.insert(customers).values({
                userId: params.userId,
                name: params.customerName,
                email: params.customerEmail,
                phone: params.customerPhone ?? null,
              });
              customerId = inserted.insertId;
            } catch (err) {
              // Lost a race with a concurrent first-order-ever request for the same signed-in
              // user -- user_id is UNIQUE, so fall back to whichever row won.
              const [raceWinner] = await tx
                .select()
                .from(customers)
                .where(eq(customers.userId, params.userId))
                .limit(1);
              if (!raceWinner) throw err;
              customerId = raceWinner.id;
            }
          }
        } else {
          const [inserted] = await tx.insert(customers).values({
            name: params.customerName,
            email: params.customerEmail,
            phone: params.customerPhone ?? null,
          });
          customerId = inserted.insertId;
        }

        const [orderResult] = await tx.insert(orders).values({
          customerId,
          serviceType: params.serviceType,
          quantity: params.quantity,
          specNotes: params.specNotes ?? null,
          paymentMethod: params.paymentMethod,
          priceCents,
        });
        const newOrderId = orderResult.insertId;

        await tx.insert(orderUploadCredentials).values({
          orderId: newOrderId,
          username: String(newOrderId),
          passwordHash,
          expiresAt,
        });

        await tx.insert(orderEvents).values({
          orderId: newOrderId,
          eventType: 'created',
          actor: 'customer',
          payloadJson: { serviceType: params.serviceType, quantity: params.quantity },
        });

        return newOrderId;
      });

      const order = await getOrderById(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} was created but could not be re-read`);
      }

      return {
        order,
        uploadCredential: { username: String(orderId), plaintextPassword, expiresAt },
      };
    },

    getOrderById,

    async getOrderWithCustomerById(id) {
      const [row] = await db
        .select({
          id: orders.id,
          customerId: orders.customerId,
          assignedTo: orders.assignedTo,
          serviceType: orders.serviceType,
          quantity: orders.quantity,
          specNotes: orders.specNotes,
          paymentMethod: orders.paymentMethod,
          priceCents: orders.priceCents,
          status: orders.status,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
          pickupReadyAt: orders.pickupReadyAt,
          completedAt: orders.completedAt,
          customerName: customers.name,
          customerEmail: customers.email,
          userId: customers.userId,
        })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(eq(orders.id, id))
        .limit(1);
      return row ?? null;
    },

    async listOrders(filter) {
  const conditions = [];

if (filter.status) {
  conditions.push(eq(orders.status, filter.status));
}

if (filter.assignedTo !== undefined) {
  conditions.push(eq(orders.assignedTo, filter.assignedTo));
}


/*
    async listOrders(filter) {
      const conditions = [];
      if (filter.status) conditions.push(eq(orders.status, filter.status));
*/
      if (filter.userId !== undefined) {
        const query = db
          .select({
            id: orders.id,
            customerId: orders.customerId,
            assignedTo: orders.assignedTo,
            serviceType: orders.serviceType,
            quantity: orders.quantity,
            specNotes: orders.specNotes,
            paymentMethod: orders.paymentMethod,
            priceCents: orders.priceCents,
            status: orders.status,
            createdAt: orders.createdAt,
            updatedAt: orders.updatedAt,
            pickupReadyAt: orders.pickupReadyAt,
            completedAt: orders.completedAt,
          })
          .from(orders)
          .innerJoin(customers, eq(orders.customerId, customers.id))
          .orderBy(desc(orders.id));
        return query.where(and(eq(customers.userId, filter.userId), ...conditions));
      }

      const query = db.select().from(orders).orderBy(desc(orders.id));
      if (conditions.length === 0) return query;
      return query.where(and(...conditions));
    },

    async listOrderFiles(orderId) {
      return db
        .select({
          id: orderFiles.id,
          objectKey: orderFiles.objectKey,
          originalFilename: orderFiles.originalFilename,
          sizeBytes: orderFiles.sizeBytes,
          uploadedAt: orderFiles.uploadedAt,
        })
        .from(orderFiles)
        .where(eq(orderFiles.orderId, orderId))
        .orderBy(orderFiles.uploadedAt);
    },

    async getOrderFile(orderId, fileId) {
      const [row] = await db
        .select({
          id: orderFiles.id,
          objectKey: orderFiles.objectKey,
          originalFilename: orderFiles.originalFilename,
          sizeBytes: orderFiles.sizeBytes,
          uploadedAt: orderFiles.uploadedAt,
        })
        .from(orderFiles)
        .where(and(eq(orderFiles.id, fileId), eq(orderFiles.orderId, orderId)))
        .limit(1);
      return row ?? null;
    },

    async registerUploadedFile(params) {
      const res = await db.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, params.orderId)).limit(1);
        if (!order) return null;

        await tx.insert(orderFiles).values({
          orderId: params.orderId,
          objectKey: params.objectKey,
          originalFilename: params.originalFilename,
          sizeBytes: params.sizeBytes,
          ...(params.uploadedVia ? { uploadedVia: params.uploadedVia } : {}),
        });
        await tx.insert(orderEvents).values({
          orderId: params.orderId,
          eventType: 'file_uploaded',
          actor: 'customer',
          payloadJson: {
            objectKey: params.objectKey,
            originalFilename: params.originalFilename,
            sizeBytes: params.sizeBytes,
          },
        });

        // The first file advances the order to files_received, from either state that can get
        // there: `submitted` (a web upload right after ordering) or `files_pending`. A no-op
        // (file recorded, status untouched) from anywhere else, e.g. a second file on an
        // already-files_received order.
        let statusChanged = false;
        if (isValidStatusTransition(order.status, 'files_received')) {
          await tx.update(orders).set({ status: 'files_received' }).where(eq(orders.id, params.orderId));
          await tx.insert(orderEvents).values({
            orderId: params.orderId,
            eventType: 'status_changed',
            actor: 'system',
            payloadJson: { from: order.status, to: 'files_received' },
          });
          statusChanged = true;
        }

        return statusChanged;
      });

      if (res === null) return null;
      const order = await getOrderById(params.orderId);
      if (!order) return null;
      return { order, statusChanged: res };
    },

    async checkUploadCredential(username, password) {
      const [credential] = await db
        .select()
        .from(orderUploadCredentials)
        .where(eq(orderUploadCredentials.username, username))
        .limit(1);

      if (!credential || credential.expiresAt.getTime() < Date.now()) {
        return { valid: false };
      }
      if (!(await bcrypt.compare(password, credential.passwordHash))) {
        return { valid: false };
      }
      return { valid: true, orderId: credential.orderId };
    },

    async verifyUploadCredential(username, password) {
      // Single-use: only a credential that hasn't been used yet and hasn't expired is eligible.
      // The UPDATE below is itself the single-use guard -- it only succeeds (affectedRows > 0)
      // the first time, closing the race between two concurrent verify attempts with the same
      // credential.
      const [credential] = await db
        .select()
        .from(orderUploadCredentials)
        .where(and(eq(orderUploadCredentials.username, username), isNull(orderUploadCredentials.usedAt)))
        .limit(1);

      if (!credential || credential.expiresAt.getTime() < Date.now()) {
        return { valid: false };
      }

      const passwordMatches = await bcrypt.compare(password, credential.passwordHash);
      if (!passwordMatches) return { valid: false };

      const [updateResult] = await db
        .update(orderUploadCredentials)
        .set({ usedAt: new Date() })
        .where(and(eq(orderUploadCredentials.id, credential.id), isNull(orderUploadCredentials.usedAt)));
      if (updateResult.affectedRows === 0) {
        // Lost the race to another concurrent verify call for the same one-time credential.
        return { valid: false };
      }

      return { valid: true, orderId: credential.orderId };
    },

    async verifyUserCredentials(username, password) { //Google auth version
      const normalizedUsername = username.trim().toLowerCase();
      const [user] = await db.select().from(users).where(eq(users.username, normalizedUsername)).limit(1);
      if (!user) return { valid: false };

      if (!user.passwordHash) return { valid: false };

      const passwordMatches = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatches) return { valid: false };

      return { valid: true, userId: user.id, username: user.username, role: user.role };
    },


        async verifyOrCreateGoogleUser({ googleId, email }) {
      // Check if this Google account is already linked to a user.
      const [existingIdentity] = await db
        .select()
        .from(googleIdentities)
        .where(eq(googleIdentities.googleId, googleId))
        .limit(1);

      if (existingIdentity) {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, existingIdentity.userId))
          .limit(1);

        if (!user) {
          throw new Error('google_identities row references a missing user');
        }

        return {
          valid: true,
          userId: user.id,
          username: user.username,
          role: user.role,
        };
      }

      // No existing link -- create a brand-new customer account for this Google user.
      // Username is derived from email since Google doesn't supply one; not guaranteed
      // collision-free, but good enough for this project's scope.
      const derivedUsername = (email.split('@')[0] ?? 'user').toLowerCase();

      return db.transaction(async (tx) => {
        const [insertResult] = await tx.insert(users).values({
          username: derivedUsername,
          passwordHash: null,
          role: 'customer',
        });

        const newUserId = insertResult.insertId;

        await tx.insert(googleIdentities).values({
          userId: newUserId,
          googleId,
          email,
        });

        return {
          valid: true,
          userId: newUserId,
          username: derivedUsername,
          role: 'customer' as const,
        };
      });
    },

    async verifyOrCreateAuth0User({ email }) {
      const normalizedEmail = email.trim().toLowerCase();

      // Reuses google_identities as a general "linked email" table -- looks up by email
      // instead of googleId, so an Auth0 sign-in with the same email as an existing
      // Google-linked account resolves to the same user.
      const [existingIdentity] = await db
        .select()
        .from(googleIdentities)
        .where(eq(googleIdentities.email, normalizedEmail))
        .limit(1);

      if (existingIdentity) {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, existingIdentity.userId))
          .limit(1);

        if (!user) {
          throw new Error('google_identities row references a missing user');
        }

        return {
          valid: true,
          userId: user.id,
          username: user.username,
          role: user.role,
        };
      }

      const derivedUsername = (normalizedEmail.split('@')[0] ?? 'user').toLowerCase();

      return db.transaction(async (tx) => {
        const [insertResult] = await tx.insert(users).values({
          username: derivedUsername,
          passwordHash: null,
          role: 'customer',
        });

        const newUserId = insertResult.insertId;

        // Synthetic googleId since there's no real one for an Auth0-only sign-in.
        // Unique per email so it never collides with a real Google account's id.
        await tx.insert(googleIdentities).values({
          userId: newUserId,
          googleId: `auth0:${normalizedEmail}`,
          email: normalizedEmail,
        });

        return {
          valid: true,
          userId: newUserId,
          username: derivedUsername,
          role: 'customer' as const,
        };
      });
    },
    /*async verifyOrCreateGoogleUser({ googleId, email }) {
      // Check if this Google account is already linked to a user.
      const [existingIdentity] = await db
        .select()
        .from(googleIdentities)
        .where(eq(googleIdentities.googleId, googleId))
        .limit(1);

      if (existingIdentity) {
        const [user] = await db.select().from(users).where(eq(users.id, existingIdentity.userId)).limit(1);
        if (!user) throw new Error('google_identities row references a missing user');
        return { valid: true, userId: user.id, username: user.username, role: user.role };
      }

    async verifyOrCreateAuth0User({ email }) {
    const normalizedEmail = email.trim().toLowerCase();

  // Reuses google_identities as a general "linked email" table -- looks up by email instead
  // of googleId, so an Auth0 sign-in with the same email as an existing Google-linked account
  // resolves to the same user.
  const [existingIdentity] = await db
    .select()
    .from(googleIdentities)
    .where(eq(googleIdentities.email, normalizedEmail))
    .limit(1);

  if (existingIdentity) {
    const [user] = await db.select().from(users).where(eq(users.id, existingIdentity.userId)).limit(1);
    if (!user) throw new Error('google_identities row references a missing user');
    return { valid: true, userId: user.id, username: user.username, role: user.role };
  }

  const derivedUsername = (normalizedEmail.split('@')[0] ?? 'user').toLowerCase();

  return db.transaction(async (tx) => {
    const [insertResult] = await tx.insert(users).values({
      username: derivedUsername,
      passwordHash: null,
      role: 'customer',
    });
    const newUserId = insertResult.insertId;

    // Synthetic googleId since there's no real one for an Auth0-only sign-in -- unique per
    // email so it never collides with a real Google account's id.
    await tx.insert(googleIdentities).values({
      userId: newUserId,
      googleId: `auth0:${normalizedEmail}`,
      email: normalizedEmail,
    });

    return { valid: true, userId: newUserId, username: derivedUsername, role: 'customer' as const };
  });
},

      // No existing link -- create a brand-new customer account for this Google user.
      // Username is derived from email since Google doesn't supply one; not guaranteed
      // collision-free, but good enough for this project's scope.
      const derivedUsername = (email.split('@')[0] ?? 'user').toLowerCase();

      return db.transaction(async (tx) => {
        const [insertResult] = await tx.insert(users).values({
          username: derivedUsername,
          passwordHash: null,
          role: 'customer',
        });
        const newUserId = insertResult.insertId;

        await tx.insert(googleIdentities).values({
          userId: newUserId,
          googleId,
          email,
        });

        return { valid: true, userId: newUserId, username: derivedUsername, role: 'customer' as const };
      });
    },*/

    async setUserCwid(userId, cwid) {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return null;

      await db.update(users).set({ cwid }).where(eq(users.id, userId));
      return { userId: user.id, username: user.username, role: user.role };
    },

    async updateOrderStatus(params) {
      return db.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, params.orderId)).limit(1);
        if (!order) return null;

        if (!isValidStatusTransition(order.status, params.status)) {
          throw new InvalidStatusTransitionError(order.status, params.status);
        }

        const timestampUpdates: Partial<{ pickupReadyAt: Date; completedAt: Date }> = {};
        if (params.status === 'ready_for_pickup') timestampUpdates.pickupReadyAt = new Date();
        if (params.status === 'completed') timestampUpdates.completedAt = new Date();

        await tx
          .update(orders)
          .set({ status: params.status, ...timestampUpdates })
          .where(eq(orders.id, params.orderId));

        await tx.insert(orderEvents).values({
          orderId: params.orderId,
          eventType: 'status_changed',
          actor: params.actor,
          payloadJson: { from: order.status, to: params.status },
        });

        const [updated] = await tx.select().from(orders).where(eq(orders.id, params.orderId)).limit(1);
        return updated ?? null;
      });
    },

    recordEvent,
  };
}


