import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, desc, eq, isNull, max, type SQL } from 'drizzle-orm';
import {
  calculatePriceCents,
  isValidStatusTransition,
  type OrderEventActor,
  type OrderStatus,
  type PaymentMethod,
  type ServiceType,
  type UploadMethod,
} from '@crimson-copies/shared';
import type { Db } from '../db/client.postgres.js';
import {
  customers,
  googleIdentities,
  orderEvents,
  orderFiles,
  orders,
  orderUploadCredentials,
  users,
} from '../db/schema.postgres.js';
import { InvalidStatusTransitionError } from './orders-repository.js';

const UPLOAD_CREDENTIAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface OrderRecord {
  id: number;
  customerId: number | null;
  customerOrderNumber: number | null;
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

export interface AssignOrderParams {
  orderId: number;
  assignedTo: number | null;
  actorUserId: number;
}

// Re-exported rather than redeclared: routes/orders.ts catches this class with `instanceof`
// against the MySQL module's copy, so a second class here would never match and an invalid
// status transition would surface as a 503 instead of a 400.
export { InvalidStatusTransitionError };

export interface OrderFileRecord {
  id: number;
  objectKey: string;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: Date;
}

export interface OrdersRepository {
  listStaffMembers(): Promise<Array<{ id: number; username: string }>>;
  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  getOrderById(id: number): Promise<OrderRecord | null>;
  getOrderWithCustomerById(id: number): Promise<OrderWithCustomer | null>;
  listOrders(filter: ListOrdersFilter): Promise<OrderRecord[]>;
  listOrderFiles(orderId: number): Promise<OrderFileRecord[]>;
  getOrderFile(orderId: number, fileId: number): Promise<OrderFileRecord | null>;
  registerUploadedFile(params: RegisterUploadedFileParams): Promise<RegisterUploadedFileResult | null>;
  verifyUploadCredential(username: string, password: string): Promise<VerifyUploadCredentialResult>;
  checkUploadCredential(username: string, password: string): Promise<VerifyUploadCredentialResult>;
  verifyUserCredentials(username: string, password: string): Promise<VerifyUserCredentialsResult>;
  verifyOrCreateGoogleUser(input: {
    googleId: string;
    email: string;
    name?: string;
  }): Promise<{ valid: true; userId: number; username: string; role: 'customer' | 'staff' }>;
  verifyOrCreateAuth0User(input: {
    email: string;
  }): Promise<{ valid: true; userId: number; username: string; role: 'customer' | 'staff' }>;
  setUserCwid(
    userId: number,
    cwid: string,
  ): Promise<{ userId: number; username: string; role: 'customer' | 'staff' } | null>;
  updateOrderStatus(params: UpdateOrderStatusParams): Promise<OrderRecord | null>;
  assignOrder(params: AssignOrderParams): Promise<OrderRecord | null>;
  recordEvent(
    orderId: number,
    eventType: string,
    actor: OrderEventActor,
    payload?: Record<string, unknown>,
  ): Promise<void>;
}

function generateUploadPassword(): string {
  return randomBytes(18).toString('base64url');
}

const orderColumns = {
  id: orders.id,
  customerId: orders.customerId,
  customerOrderNumber: orders.customerOrderNumber,
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
};

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
    async listStaffMembers() {
      return db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.role, 'staff'))
        .orderBy(users.username);
    },

    async createOrder(params) {
      const priceCents = calculatePriceCents(params.serviceType, params.quantity);
      const plaintextPassword = generateUploadPassword();
      const passwordHash = await bcrypt.hash(plaintextPassword, bcryptRounds);
      const expiresAt = new Date(Date.now() + UPLOAD_CREDENTIAL_TTL_MS);

      const orderId = await db.transaction(async (tx) => {
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
              const [inserted] = await tx
                .insert(customers)
                .values({
                  userId: params.userId,
                  name: params.customerName,
                  email: params.customerEmail,
                  phone: params.customerPhone ?? null,
                })
                .returning({ id: customers.id });
              customerId = inserted!.id;
            } catch (err) {
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
          const [inserted] = await tx
            .insert(customers)
            .values({
              name: params.customerName,
              email: params.customerEmail,
              phone: params.customerPhone ?? null,
            })
            .returning({ id: customers.id });
          customerId = inserted!.id;
        }

        // Signed-in customers get their own running count. Locking their customers row
        // serializes two orders placed at once, so both can't read the same max.
        let customerOrderNumber: number | null = null;
        if (params.userId) {
          await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).for('update');
          const [latest] = await tx
            .select({ value: max(orders.customerOrderNumber) })
            .from(orders)
            .where(eq(orders.customerId, customerId));
          customerOrderNumber = (latest?.value ?? 0) + 1;
        }

        const [orderResult] = await tx
          .insert(orders)
          .values({
            customerId,
            customerOrderNumber,
            serviceType: params.serviceType,
            quantity: params.quantity,
            specNotes: params.specNotes ?? null,
            paymentMethod: params.paymentMethod,
            priceCents,
          })
          .returning({ id: orders.id });
        const newOrderId = orderResult!.id;

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
          ...orderColumns,
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
      const conditions: SQL[] = [];
      if (filter.status) conditions.push(eq(orders.status, filter.status));
      if (filter.assignedTo !== undefined) conditions.push(eq(orders.assignedTo, filter.assignedTo));

      if (filter.userId !== undefined) {
        return db
          .select(orderColumns)
          .from(orders)
          .innerJoin(customers, eq(orders.customerId, customers.id))
          .where(and(eq(customers.userId, filter.userId), ...conditions))
          .orderBy(desc(orders.id));
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

        // First file advances the order to files_received from `submitted` or `files_pending`.
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

      const updateResult = await db
        .update(orderUploadCredentials)
        .set({ usedAt: new Date() })
        .where(and(eq(orderUploadCredentials.id, credential.id), isNull(orderUploadCredentials.usedAt)))
        .returning({ id: orderUploadCredentials.id });

      if (updateResult.length === 0) {
        return { valid: false };
      }

      return { valid: true, orderId: credential.orderId };
    },

    async verifyUserCredentials(username, password) {
      const normalizedUsername = username.trim().toLowerCase();
      const [user] = await db.select().from(users).where(eq(users.username, normalizedUsername)).limit(1);
      if (!user || !user.passwordHash) return { valid: false };

      const passwordMatches = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatches) return { valid: false };

      return { valid: true, userId: user.id, username: user.username, role: user.role };
    },

    async verifyOrCreateGoogleUser({ googleId, email }) {
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

      const derivedUsername = (email.split('@')[0] ?? 'user').toLowerCase();

      return db.transaction(async (tx) => {
        const [insertResult] = await tx
          .insert(users)
          .values({ username: derivedUsername, passwordHash: null, role: 'customer' })
          .returning({ id: users.id });
        const newUserId = insertResult!.id;

        await tx.insert(googleIdentities).values({ userId: newUserId, googleId, email });

        return { valid: true, userId: newUserId, username: derivedUsername, role: 'customer' as const };
      });
    },

    async verifyOrCreateAuth0User({ email }) {
      const normalizedEmail = email.trim().toLowerCase();

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
        const [insertResult] = await tx
          .insert(users)
          .values({ username: derivedUsername, passwordHash: null, role: 'customer' })
          .returning({ id: users.id });
        const newUserId = insertResult!.id;

        await tx.insert(googleIdentities).values({
          userId: newUserId,
          googleId: `auth0:${normalizedEmail}`,
          email: normalizedEmail,
        });

        return { valid: true, userId: newUserId, username: derivedUsername, role: 'customer' as const };
      });
    },

    async setUserCwid(userId, cwid) {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return null;

      await db.update(users).set({ cwid }).where(eq(users.id, userId));
      return { userId: user.id, username: user.username, role: user.role };
    },

    async assignOrder(params) {
      return db.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, params.orderId)).limit(1);
        if (!order) return null;

        if (params.assignedTo !== null) {
          const [staffMember] = await tx
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.id, params.assignedTo), eq(users.role, 'staff')))
            .limit(1);
          if (!staffMember) return null;
        }

        if (order.assignedTo === params.assignedTo) return order;

        await tx
          .update(orders)
          .set({ assignedTo: params.assignedTo, updatedAt: new Date() })
          .where(eq(orders.id, params.orderId));
        await tx.insert(orderEvents).values({
          orderId: params.orderId,
          eventType: 'assignment_changed',
          actor: 'staff',
          payloadJson: {
            from: order.assignedTo,
            to: params.assignedTo,
            assignedBy: params.actorUserId,
          },
        });

        const [updated] = await tx.select().from(orders).where(eq(orders.id, params.orderId)).limit(1);
        return updated ?? null;
      });
    },

    async updateOrderStatus(params) {
      return db.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, params.orderId)).limit(1);
        if (!order) return null;

        if (!isValidStatusTransition(order.status, params.status)) {
          throw new InvalidStatusTransitionError(order.status, params.status);
        }

        const timestampUpdates: Partial<{
          pickupReadyAt: Date | null;
          completedAt: Date | null;
          updatedAt: Date;
        }> = {
          updatedAt: new Date(),
        };
        if (params.status === 'ready_for_pickup') {
          timestampUpdates.pickupReadyAt = new Date();
          timestampUpdates.completedAt = null;
        } else if (params.status === 'completed') {
          timestampUpdates.completedAt = new Date();
        } else if (params.status !== 'cancelled') {
          timestampUpdates.pickupReadyAt = null;
          timestampUpdates.completedAt = null;
        }

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