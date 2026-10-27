import { relations } from 'drizzle-orm';
import {
  bigint,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { UPLOAD_METHODS } from '@crimson-copies/shared';

export const userRoleEnum = pgEnum('user_role', ['customer', 'staff']);
export const serviceTypeEnum = pgEnum('service_type', [
  'poster',
  'resume_portfolio',
  'class_assignment',
  'department_job',
  'personal_printing',
]);
export const paymentMethodEnum = pgEnum('payment_method', ['bama_cash', 'card', 'cash']);
export const orderStatusEnum = pgEnum('order_status', [
  'submitted',
  'files_pending',
  'files_received',
  'in_production',
  'ready_for_pickup',
  'completed',
  'cancelled',
]);
export const uploadMethodEnum = pgEnum('upload_method', UPLOAD_METHODS);
export const orderEventActorEnum = pgEnum('order_event_actor', ['system', 'staff', 'customer']);

export const users = pgTable('users', {
  id: bigint('id', { mode: 'number' }).generatedByDefaultAsIdentity().primaryKey(),
  username: varchar('username', { length: 64 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  cwid: varchar('cwid', { length: 20 }),
  role: userRoleEnum('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const customers = pgTable('customers', {
  id: bigint('id', { mode: 'number' }).generatedByDefaultAsIdentity().primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).unique().references(() => users.id),
  name: varchar('name', { length: 255 }).notNull(),
  // Intentionally not unique; existing guest orders include repeated customer emails.
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const orders = pgTable('orders', {
  id: bigint('id', { mode: 'number' }).generatedByDefaultAsIdentity().primaryKey(),
  assignedTo: bigint('assigned_to', { mode: 'number' }),
  customerId: bigint('customer_id', { mode: 'number' }).references(() => customers.id),
  // 1, 2, 3... per signed-in customer, so their 4th order reads "#4" instead of the global id.
  // Null for guest orders, which have no lasting customer to count against.
  customerOrderNumber: integer('customer_order_number'),
  serviceType: serviceTypeEnum('service_type').notNull(),
  quantity: integer('quantity').notNull().default(1),
  specNotes: text('spec_notes'),
  paymentMethod: paymentMethodEnum('payment_method').notNull(),
  priceCents: integer('price_cents'),
  status: orderStatusEnum('status').notNull().default('submitted'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  pickupReadyAt: timestamp('pickup_ready_at', { withTimezone: true, mode: 'date' }),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
}, (table) => [
  uniqueIndex('orders_customer_order_number_unique').on(table.customerId, table.customerOrderNumber),
]);

export const orderUploadCredentials = pgTable('order_upload_credentials', {
  id: bigint('id', { mode: 'number' }).generatedByDefaultAsIdentity().primaryKey(),
  orderId: bigint('order_id', { mode: 'number' })
    .notNull()
    .unique()
    .references(() => orders.id),
  username: varchar('username', { length: 64 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
});

export const orderFiles = pgTable('order_files', {
  id: bigint('id', { mode: 'number' }).generatedByDefaultAsIdentity().primaryKey(),
  orderId: bigint('order_id', { mode: 'number' })
    .notNull()
    .references(() => orders.id),
  objectKey: varchar('object_key', { length: 512 }).notNull(),
  originalFilename: varchar('original_filename', { length: 255 }).notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  uploadedVia: uploadMethodEnum('uploaded_via').notNull().default('sftp'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const orderEvents = pgTable('order_events', {
  id: bigint('id', { mode: 'number' }).generatedByDefaultAsIdentity().primaryKey(),
  orderId: bigint('order_id', { mode: 'number' })
    .notNull()
    .references(() => orders.id),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  actor: orderEventActorEnum('actor').notNull(),
  payloadJson: jsonb('payload_json'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const googleIdentities = pgTable('google_identities', {
  id: bigint('id', { mode: 'number' }).generatedByDefaultAsIdentity().primaryKey(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .unique()
    .references(() => users.id),
  googleId: varchar('google_id', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
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