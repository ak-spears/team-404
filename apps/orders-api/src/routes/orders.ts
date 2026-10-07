import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  orderCreateInputSchema,
  orderListQuerySchema,
  orderStatusUpdateInputSchema,
  type Order,
  type OrderListQuery,
} from '@crimson-copies/shared';
import type { Config } from '../config.js';
import { doNotifyThing } from '../lib/notify-and-record.js';
import { getStorageClient, MAX_UPLOAD_BYTES } from '../lib/storage.js';
import { createRequireInternalKey } from '../plugins/internal-auth.js';
import {
  InvalidStatusTransitionError,
  type OrderRecord,
  type OrdersRepository,
  type OrderWithCustomer,
} from '../repositories/orders-repository.js';


function toOrderDto(record: OrderRecord): Order {
  return {
    id: record.id,
    customerId: record.customerId,
    assignedTo: record.assignedTo,
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

/**
 * Print work: documents and images. An allowlist rather than a blocklist -- staff open these
 * files on shop machines, so anything that isn't recognisably print material is refused.
 */
const ALLOWED_FILE_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'rtf', 'csv',
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff', 'svg', 'eps', 'ai', 'psd', 'zip',
]);

/**
 * Reduces an uploaded filename to something safe to put in an object key: last path segment
 * only (a browser may send a full path), and nothing outside a conservative character set --
 * the key namespace is shared by every order, so a name can never be allowed to steer it.
 */
function sanitizeFilename(filename: string): string {
  const lastSegment = filename.split(/[\\/]/).pop() ?? '';
  const cleaned = lastSegment.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 200);
  return cleaned.length > 0 ? cleaned : 'upload';
}

function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

/**
 * Content-Type by (already allowlisted) extension. Derived here rather than taken from the
 * multipart part's mimetype, which the uploading browser -- i.e. the customer -- controls: files
 * are now served from the storefront's own origin, so a `.pdf` declared as text/html must never
 * be rendered as HTML there.
 */
const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain; charset=utf-8',
  rtf: 'application/rtf',
  csv: 'text/csv; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
  eps: 'application/postscript',
  ai: 'application/postscript',
  psd: 'image/vnd.adobe.photoshop',
  zip: 'application/zip',
};

function contentTypeFor(filename: string): string {
  return CONTENT_TYPES[fileExtension(filename)] ?? 'application/octet-stream';
}

/**
 * Formats that execute script when a browser renders them inline. Downloads are served from the
 * app's own origin, so an inline SVG would run its JavaScript with access to that origin's
 * cookies -- stored XSS by way of print artwork. These are always sent as attachments.
 */
const NEVER_INLINE_EXTENSIONS = new Set(['svg', 'htm', 'html', 'xhtml', 'xml']);

/**
 * Types opened inline WITHOUT `Content-Security-Policy: sandbox`: browser PDF viewers can render
 * blank in a sandboxed document (reported for Chrome), which defeats opening a file to print it.
 * Neither a PDF in the browser's viewer nor a raster image can run script on this origin, and
 * the server-chosen Content-Type plus `nosniff` stops either being re-read as HTML. Everything
 * else keeps the sandbox; svg/html/xml are additionally forced to download (see above).
 */
const UNSANDBOXED_INLINE_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff']);

/** `inline` so PDFs and images open in a tab for printing; the name is re-sanitized on the way out. */
function contentDisposition(originalFilename: string): string {
  const safeName = sanitizeFilename(originalFilename);
  const mode = NEVER_INLINE_EXTENSIONS.has(fileExtension(safeName)) ? 'attachment' : 'inline';
  return `${mode}; filename="${safeName}"`;
}

/**
 * One line per upload attempt, whatever happened -- the reason is a fixed code, never a header
 * value, so the upload token can't end up in a log.
 */
function logUploadOutcome(fields: {
  orderId: number;
  statusCode: number;
  reason: string;
  [key: string]: unknown;
}): void {
  if (fields.statusCode >= 500) {
    console.error('upload outcome', fields);
  } else {
    console.log('upload outcome', fields);
  }
}

type FileAccess = 'staff' | 'owner' | 'upload_token';

/**
 * Who may write files to, or read file bytes from, an order: staff, the customer the order
 * belongs to, or the holder of the upload credential minted when the order was placed -- which
 * is how a guest, who has no session at all, proves the order is theirs. Stricter than
 * isForbiddenForCustomer on purpose: that rule lets an unidentified caller through (tolerable for
 * the order summary), but order ids are sequential, so the same rule here would let anyone
 * enumerate ids and attach files to, or read files from, a stranger's order.
 */
async function authorizeFileAccess(
  request: FastifyRequest,
  order: OrderWithCustomer,
  repository: OrdersRepository,
): Promise<FileAccess | null> {
  const { role, id: userId } = request.internalUser;
  if (role === 'staff') return 'staff';
  if (role === 'customer' && userId !== undefined && order.userId !== null && Number(userId) === order.userId) {
    return 'owner';
  }

  const uploadToken = request.headers['x-upload-token'];
  if (typeof uploadToken === 'string' && uploadToken.length > 0) {
    const credential = await repository.checkUploadCredential(String(order.id), uploadToken);
    if (credential.valid && credential.orderId === order.id) return 'upload_token';
  }
  return null;
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : 'UnknownError';
}

function errorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
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

  /**
   * Customer (or staff) file upload. orders-api owns every write to MinIO the same way it owns
   * every write to the database: the web apps forward the multipart body here and never hold
   * storage credentials themselves. The object lands first and the `order_files` row second, so
   * a failure anywhere leaves no row pointing at bytes that aren't there -- the object is deleted
   * instead. Every exit logs one `upload outcome` line.
   */
  app.post<{ Params: { id: string } }>(
    '/api/orders/:id/files',
    { preHandler: requireInternalKey },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        logUploadOutcome({ orderId: id, statusCode: 404, reason: 'invalid_order_id' });
        return reply.code(404).send({ error: 'not_found' });
      }

      const order = await options.repository.getOrderWithCustomerById(id);
      if (!order) {
        logUploadOutcome({ orderId: id, statusCode: 404, reason: 'order_not_found' });
        return reply.code(404).send({ error: 'not_found' });
      }

      const access = await authorizeFileAccess(request, order, options.repository);
      if (!access) {
        logUploadOutcome({
          orderId: id,
          statusCode: 403,
          reason: 'forbidden',
          role: request.internalUser.role ?? 'anonymous',
        });
        return reply.code(403).send({ error: 'forbidden' });
      }

      const part = await request.file();
      if (!part) {
        logUploadOutcome({ orderId: id, statusCode: 400, reason: 'file_required', access });
        return reply.code(400).send({ error: 'file_required' });
      }

      const originalFilename = sanitizeFilename(part.filename);
      if (!ALLOWED_FILE_EXTENSIONS.has(fileExtension(originalFilename))) {
        // Drain the stream so the connection isn't left half-read.
        part.file.resume();
        logUploadOutcome({
          orderId: id,
          statusCode: 415,
          reason: 'unsupported_file_type',
          access,
          extension: fileExtension(originalFilename),
        });
        return reply.code(415).send({ error: 'unsupported_file_type' });
      }

      // A UUID prefix keeps two customers' `resume.pdf` apart within the same order and makes
      // the key unguessable; the original name is preserved in the database for staff to read.
      const objectKey = `${id}/${randomUUID()}-${originalFilename}`;
      const storage = getStorageClient(options.config);
      const bucket = options.config.MINIO_BUCKET;

      try {
        await storage.putObject(bucket, objectKey, part.file, undefined, {
          'Content-Type': contentTypeFor(originalFilename),
        });
      } catch (err) {
        logUploadOutcome({
          orderId: id,
          statusCode: 503,
          reason: 'storage_put_failed',
          access,
          objectKey,
          errorName: errorName(err),
          errorCode: errorCode(err),
        });
        return reply.code(503).send({ error: 'storage_unavailable' });
      }

      const removeObject = async (why: string): Promise<void> => {
        try {
          await storage.removeObject(bucket, objectKey);
        } catch (err) {
          console.error('could not remove orphaned upload', {
            orderId: id,
            objectKey,
            why,
            errorName: errorName(err),
            errorCode: errorCode(err),
          });
        }
      };

      // @fastify/multipart flags the stream once it hits the size limit; whatever reached MinIO
      // is a truncated file, so drop it rather than record a corrupt upload.
      if (part.file.truncated) {
        await removeObject('truncated');
        logUploadOutcome({ orderId: id, statusCode: 413, reason: 'file_too_large', access });
        return reply.code(413).send({ error: 'file_too_large', maxBytes: MAX_UPLOAD_BYTES });
      }

      // The size comes from storage rather than a client-supplied header -- it is the only
      // number that describes what was actually stored. Both the stat and the database write
      // sit inside one try: either failing after the bytes landed must not leave an orphan.
      let sizeBytes: number;
      let result;
      try {
        sizeBytes = (await storage.statObject(bucket, objectKey)).size;
        result = await options.repository.registerUploadedFile({
          orderId: id,
          objectKey,
          originalFilename,
          sizeBytes,
          uploadedVia: 'web',
        });
      } catch (err) {
        await removeObject('registration_failed');
        // Name, driver code and message only: the error object itself can carry connection
        // details, and a message from Postgres/MinIO never includes credentials.
        logUploadOutcome({
          orderId: id,
          statusCode: 500,
          reason: 'registration_failed',
          access,
          objectKey,
          errorName: errorName(err),
          errorCode: errorCode(err),
          errorMessage: err instanceof Error ? err.message : undefined,
        });
        return reply.code(500).send({
          error: 'file_registration_failed',
          message: 'The file was received but could not be saved to the order. Please try again.',
        });
      }

      if (!result) {
        // The order disappeared between the lookup above and the insert.
        await removeObject('order_vanished');
        logUploadOutcome({ orderId: id, statusCode: 404, reason: 'order_not_found', access });
        return reply.code(404).send({ error: 'not_found' });
      }

      logUploadOutcome({
        orderId: id,
        statusCode: 201,
        reason: 'uploaded',
        access,
        objectKey,
        sizeBytes,
        statusChanged: result.statusChanged,
      });

      // Same rule as the file-intake registration path: the customer hears about it once, when
      // the first file flips the order to files_received -- not on every subsequent file.
      if (result.statusChanged && order.customerEmail) {
        await doNotifyThing(notifyDeps, id, {
          template: 'files-received',
          to: order.customerEmail,
          data: { orderId: id, customerName: order.customerName ?? 'Customer' },
        });
      }

      return reply.code(201).send({
        originalFilename,
        sizeBytes,
        status: result.order.status,
      });
    },
  );

  /**
   * Streams one uploaded file's bytes. MinIO listens on 127.0.0.1 only, so browsers can't follow
   * a presigned link to it; instead the storefront and staff-console BFFs proxy this route behind
   * their own session checks. Access is the same rule as uploading (authorizeFileAccess).
   */
  app.get<{ Params: { id: string; fileId: string } }>(
    '/api/orders/:id/files/:fileId/content',
    { preHandler: requireInternalKey },
    async (request, reply) => {
      const id = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(fileId) || fileId <= 0) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const order = await options.repository.getOrderWithCustomerById(id);
      if (!order) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const access = await authorizeFileAccess(request, order, options.repository);
      if (!access) {
        console.log('file download rejected', { orderId: id, fileId, role: request.internalUser.role ?? 'anonymous' });
        return reply.code(403).send({ error: 'forbidden' });
      }

      const file = await options.repository.getOrderFile(id, fileId);
      if (!file) {
        return reply.code(404).send({ error: 'not_found' });
      }

      let stream;
      try {
        stream = await getStorageClient(options.config).getObject(options.config.MINIO_BUCKET, file.objectKey);
      } catch (err) {
        const code = errorCode(err);
        console.error('file download from storage failed', {
          orderId: id,
          fileId,
          errorName: errorName(err),
          errorCode: code,
        });
        if (code === 'NoSuchKey') {
          return reply.code(404).send({ error: 'not_found' });
        }
        return reply.code(503).send({ error: 'storage_unavailable' });
      }

      console.log('file downloaded', { orderId: id, fileId, access });
      reply
        .code(200)
        .header('Content-Type', contentTypeFor(file.originalFilename))
        .header('Content-Length', String(file.sizeBytes))
        .header('Content-Disposition', contentDisposition(file.originalFilename))
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', 'private, no-store');
      if (!UNSANDBOXED_INLINE_EXTENSIONS.has(fileExtension(sanitizeFilename(file.originalFilename)))) {
        // Belt and braces for anything else rendered inline: no script, no same-origin access.
        reply.header('Content-Security-Policy', 'sandbox');
      }
      return reply.send(stream);
    },
  );
app.get<{ Querystring: OrderListQuery }>(
  '/api/orders',
  { preHandler: requireInternalKey },
  async (request, reply) => {

    const parsed = orderListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_failed', issues: parsed.error.issues });
    }

 const { role, id: userId } = request.internalUser;

let filterUserId: number | undefined;
let filterAssignedTo: number | undefined;

if (parsed.data.mine) {
  const parsedUserId = parseUserId(userId);

  if (parsedUserId === undefined) {
    return reply.code(200).send([]);
  }

  if (role === 'customer') {
    filterUserId = parsedUserId;
  } else if (role === 'staff') {
    filterAssignedTo = parsedUserId;
  } else {
    return reply.code(200).send([]);
  }
} else if (role !== 'staff') {
  return reply.code(403).send({ error: 'forbidden' });
}

const filter: {
  status?: typeof parsed.data.status;
  userId?: number;
  assignedTo?: number;
} = {};

if (parsed.data.status) {
  filter.status = parsed.data.status;
}

if (filterUserId !== undefined) {
  filter.userId = filterUserId;
}

if (filterAssignedTo !== undefined) {
  filter.assignedTo = filterAssignedTo;
}

const list = await options.repository.listOrders(filter);

return reply.code(200).send(list.map(toOrderDto));
  },
);

}