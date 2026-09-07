import { relations } from 'drizzle-orm';
import {
  bigint,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/mysql-core';
import {
  ORDER_EVENT_ACTORS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  SERVICE_TYPES,
  UPLOAD_METHODS,
} from '@crimson-copies/shared';

// All 6 tables below are owned exclusively by orders-api -- no other service ever connects
// to MySQL directly.

export const users = mysqlTable('users', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  username: varchar('username', { length: 64 }).notNull().unique(),
  // bcrypt hash; the plaintext is never stored.
  passwordHash: varchar('password_hash', { length: 255 }),
  role: mysqlEnum('role', ['customer', 'staff']).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const customers = mysqlTable('customers', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  // Nullable: a guest order (no signed-in user) still gets a customers row, with user_id left
  // null, so the customerName/email/phone from POST /api/orders has somewhere to persist.
  userId: bigint('user_id', { mode: 'number' }).unique().references(() => users.id),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 32 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const orders = mysqlTable('orders', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  customerId: bigint('customer_id', { mode: 'number' }).references(() => customers.id),
  serviceType: mysqlEnum('service_type', SERVICE_TYPES).notNull(),
  quantity: int('quantity').notNull().default(1),
  specNotes: text('spec_notes'),
  paymentMethod: mysqlEnum('payment_method', PAYMENT_METHODS).notNull(),
  // Set at creation from the static pricing table, except department_job which staff quotes
  // manually (see packages/shared/src/pricing.ts) -- stays null until then.
  priceCents: int('price_cents'),
  status: mysqlEnum('status', ORDER_STATUSES).notNull().default('submitted'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .onUpdateNow(),
  pickupReadyAt: timestamp('pickup_ready_at'),
  completedAt: timestamp('completed_at'),
});

export const orderUploadCredentials = mysqlTable('order_upload_credentials', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  orderId: bigint('order_id', { mode: 'number' })
    .notNull()
    .unique()
    .references(() => orders.id),
  // Human-typeable SFTP username: the order id as a string.
  username: varchar('username', { length: 64 }).notNull(),
  // bcrypt hash; the plaintext is returned once in POST /api/orders's response and never
  // stored.
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
});

export const orderFiles = mysqlTable('order_files', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  orderId: bigint('order_id', { mode: 'number' })
    .notNull()
    .references(() => orders.id),
  // MinIO key: "<order_id>/<original_filename>".
  objectKey: varchar('object_key', { length: 512 }).notNull(),
  originalFilename: varchar('original_filename', { length: 255 }).notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  uploadedVia: mysqlEnum('uploaded_via', UPLOAD_METHODS).notNull().default('sftp'),
  uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
});

export const orderEvents = mysqlTable('order_events', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  orderId: bigint('order_id', { mode: 'number' })
    .notNull()
    .references(() => orders.id),
  // e.g. 'created', 'file_uploaded', 'status_changed', 'email_sent', 'email_send_failed'.
  eventType: varchar('event_type', { length: 64 }).notNull(),
  actor: mysqlEnum('actor', ORDER_EVENT_ACTORS).notNull(),
  payloadJson: json('payload_json'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});



export const googleIdentities = mysqlTable('google_identities', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .unique()
    .references(() => users.id),
  googleId: varchar('google_id', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const googleIdentitiesRelations = relations(googleIdentities, ({ one }) => ({
  user: one(users, { fields: [googleIdentities.userId], references: [users.id] }),
}));





export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  uploadCredential: one(orderUploadCredentials, {
    fields: [orders.id],
    references: [orderUploadCredentials.orderId],
  }),
  files: many(orderFiles),
  events: many(orderEvents),
}));

export const orderUploadCredentialsRelations = relations(orderUploadCredentials, ({ one }) => ({
  order: one(orders, { fields: [orderUploadCredentials.orderId], references: [orders.id] }),
}));

export const orderFilesRelations = relations(orderFiles, ({ one }) => ({
  order: one(orders, { fields: [orderFiles.orderId], references: [orders.id] }),
}));

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
}));
