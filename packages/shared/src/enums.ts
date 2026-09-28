/**
 * Enum value lists shared by every service. Kept as plain `as const` tuples (not zod schemas)
 * so they can also drive the Drizzle `mysqlEnum(...)` column definitions in orders-api without
 * a zod dependency leaking into the DB layer's column types.
 */

export const SERVICE_TYPES = [
  'poster',
  'resume_portfolio',
  'class_assignment',
  'department_job',
  'personal_printing',
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const PAYMENT_METHODS = ['bama_cash', 'card', 'cash'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ORDER_STATUSES = [
  'submitted',
  'files_pending',
  'files_received',
  'in_production',
  'ready_for_pickup',
  'completed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_EVENT_ACTORS = ['system', 'staff', 'customer'] as const;
export type OrderEventActor = (typeof ORDER_EVENT_ACTORS)[number];

// 'web' is a browser upload through orders-api; 'sftp' predates it and is kept for the rows
// the (never-built) file-intake service would have written.
export const UPLOAD_METHODS = ['sftp', 'web'] as const;
export type UploadMethod = (typeof UPLOAD_METHODS)[number];

export const USER_ROLES = ['customer', 'staff'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const EMAIL_TEMPLATES = [
  'order-confirmation',
  'files-received',
  'ready-for-pickup',
  'incident-notice',
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];
