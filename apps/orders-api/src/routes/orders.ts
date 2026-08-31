import type { FastifyInstance } from 'fastify';
import {
  orderCreateInputSchema,
  orderListQuerySchema,
  orderStatusUpdateInputSchema,
  type Order,
} from '@crimson-copies/shared';
import type { Config } from '../config.js';
import { doNotifyThing } from '../lib/notify-and-record.js';
import { createRequireInternalKey } from '../plugins/internal-auth.js';
import {
  InvalidStatusTransitionError,
  type OrderRecord,
  type OrdersRepository,
} from '../repositories/orders-repository.js';

function toOrderDto(record: OrderRecord): Order {
  return {
    id: record.id,
    customerId: record.customerId,
    serviceType: record.serviceType,
    quantity: record.quantity,
    specNotes: record.specNotes,
    paymentMethod: record.paymentMethod,
    priceCents: record.priceCents,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    pickupReadyAt: record.pickupReadyAt ? record.pickupReadyAt.toISOString() : null,
    completedAt: record.completedAt ? record.completedAt.toISOString() : null,
  };
}

export interface OrdersRoutesOptions {
  repository: OrdersRepository;
  config: Config;
}

/**
 * A customer identity may only read its own order/files (matched by user id, not the internal
 * numeric customerId); staff (or no verifiable identity, i.e. guest orders) can read any order.
 * Shared by GET /:id and GET /:id/files.
 */
function isForbiddenForCustomer(
  role: 'customer' | 'staff' | undefined,
  userId: string | undefined,
  orderUserId: number | null,
): boolean {
  if (role !== 'customer') return false;
  return !userId || orderUserId === null || Number(userId) !== orderUserId;
}

/**
 * Parses the trusted `X-User-Id` header (always a string over the wire) into the numeric id
 * users.id actually is. Anything that isn't a positive integer is treated as absent.
 */
function parseUserId(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Registers the customer/staff-facing orders-api routes. `/internal/*` (file registration,
 * credential verification) live in routes/internal.ts.
 */
export function registerOrdersRoutes(app: FastifyInstance, options: OrdersRoutesOptions): void {
  const requireInternalKey = createRequireInternalKey(options.config.INTERNAL_API_KEY);
  const notifyDeps = {
    notifyUrl: options.config.NOTIFY_URL,
    internalApiKey: options.config.INTERNAL_API_KEY,
    repository: options.repository,
  };

  app.post('/api/orders', { preHandler: requireInternalKey }, async (request, reply) => {
    const parsed = orderCreateInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_failed', issues: parsed.error.issues });
    }

    // X-User-Id (set by the BFF only after it verified a local session) links this order to a
    // persistent customer identity; absent, it's a guest order. Taken from the trusted internal
    // header, never the request body.
    const { order, uploadCredential } = await options.repository.createOrder({
      ...parsed.data,
      userId: parseUserId(request.internalUser.id),
    });
    console.log('order created', {
      orderId: order.id,
      serviceType: order.serviceType,
      quantity: order.quantity,
    });

    const uploadInstructions = {
      host: options.config.FILE_INTAKE_HOST,
      port: options.config.FILE_INTAKE_PORT,
      username: uploadCredential.username,
      password: uploadCredential.plaintextPassword,
      expiresAt: uploadCredential.expiresAt.toISOString(),
    };

    // Fire-and-forget with logging -- never blocks/fails the order-creation response.
    await doNotifyThing(notifyDeps, order.id, {
      template: 'order-confirmation',
      to: parsed.data.customerEmail,
      data: {
        orderId: order.id,
        customerName: parsed.data.customerName,
        serviceType: parsed.data.serviceType,
        quantity: parsed.data.quantity,
        uploadInstructions,
      },
    });

    return reply.code(201).send({ orderId: order.id, uploadInstructions });
  });

  // staff-console BFF only (X-User-Role: staff required).
  app.patch<{ Params: { id: string } }>(
    '/api/orders/:id/status',
    { preHandler: requireInternalKey },
    async (request, reply) => {
      if (request.internalUser.role !== 'staff') {
        return reply.code(403).send({ error: 'forbidden' });
      }

      const id = Number(request.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const parsed = orderStatusUpdateInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_failed', issues: parsed.error.issues });
      }

      let updated: OrderRecord | null;
      try {
        updated = await options.repository.updateOrderStatus({
          orderId: id,
          status: parsed.data.status,
          actor: 'staff',
        });
      } catch (err) {
        if (err instanceof InvalidStatusTransitionError) {
          return reply.code(400).send({ error: 'invalid_transition', message: err.message });
        }
        throw err;
      }
      if (!updated) {
        return reply.code(404).send({ error: 'not_found' });
      }
      console.log('order status changed', { orderId: id, status: updated.status });

      // Triggers a notify call when status enters files_received or ready_for_pickup.
      if (updated.status === 'files_received' || updated.status === 'ready_for_pickup') {
        const orderWithCustomer = await options.repository.getOrderWithCustomerById(id);
        if (orderWithCustomer?.customerEmail) {
          const deps = notifyDeps;
          if (updated.status === 'files_received') {
            await doNotifyThing(deps, id, {
              template: 'files-received',
              to: orderWithCustomer.customerEmail,
              data: { orderId: id, customerName: orderWithCustomer.customerName ?? 'Customer' },
            });
          } else {
            await doNotifyThing(deps, id, {
              template: 'ready-for-pickup',
              to: orderWithCustomer.customerEmail,
              data: {
                orderId: id,
                customerName: orderWithCustomer.customerName ?? 'Customer',
                serviceType: updated.serviceType,
              },
            });
          }
        }
      }

      return reply.code(200).send(toOrderDto(updated));
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/orders/:id',
    { preHandler: requireInternalKey },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const order = await options.repository.getOrderWithCustomerById(id);
      if (!order) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const { role, id: userId } = request.internalUser;
      if (isForbiddenForCustomer(role, userId, order.userId)) {
        return reply.code(403).send({ error: 'forbidden' });
      }

      return reply.code(200).send(toOrderDto(order));
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/orders/:id/files',
    { preHandler: requireInternalKey },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const order = await options.repository.getOrderWithCustomerById(id);
      if (!order) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const { role, id: userId } = request.internalUser;
      if (isForbiddenForCustomer(role, userId, order.userId)) {
        return reply.code(403).send({ error: 'forbidden' });
      }

      const files = await options.repository.listOrderFiles(id);
      const fileDtos = [];
      for (const file of files) {
        fileDtos.push({
          id: file.id,
          objectKey: file.objectKey,
          originalFilename: file.originalFilename,
          sizeBytes: file.sizeBytes,
          uploadedAt: file.uploadedAt.toISOString(),
        });
      }
      return reply.code(200).send(fileDtos);
    },
  );

  app.get('/api/orders', { preHandler: requireInternalKey }, async (request, reply) => {
    const parsed = orderListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_failed', issues: parsed.error.issues });
    }

    const { role, id: userId } = request.internalUser;
    let filterUserId: number | undefined;
    if (parsed.data.mine) {
      // "mine=true" without a verifiable identity can't be honored (guest orders have no stable
      // identity to filter by) -- return an empty list rather than erroring, since an empty "my
      // orders" view is the correct answer when no customer session exists.
      const parsedUserId = parseUserId(userId);
      if (role !== 'customer' || parsedUserId === undefined) {
        return reply.code(200).send([]);
      }
      filterUserId = parsedUserId;
    } else if (role !== 'staff') {
      // The unfiltered queue is a staff-only view. Without this, any caller could omit `mine`
      // and read every customer's orders.
      return reply.code(403).send({ error: 'forbidden' });
    }

    const filter: { status?: typeof parsed.data.status; userId?: number } = {};
    if (parsed.data.status) filter.status = parsed.data.status;
    if (filterUserId !== undefined) filter.userId = filterUserId;

    const list = await options.repository.listOrders(filter);
    return reply.code(200).send(list.map(toOrderDto));
  });
}
