import { z } from 'zod';
import {
  EMAIL_TEMPLATES,
  ORDER_EVENT_ACTORS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  SERVICE_TYPES,
  UPLOAD_METHODS,
  USER_ROLES,
} from './enums.js';

export const serviceTypeSchema = z.enum(SERVICE_TYPES);
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const orderEventActorSchema = z.enum(ORDER_EVENT_ACTORS);
export const uploadMethodSchema = z.enum(UPLOAD_METHODS);
export const emailTemplateSchema = z.enum(EMAIL_TEMPLATES);
export const userRoleSchema = z.enum(USER_ROLES);

/** Body of `POST /internal/auth/verify-google` (storefront BFF -> orders-api). */
export const googleAuthCodeInputSchema = z.object({
  code: z.string().min(1),
  redirectUri: z.string().min(1),
});
export type GoogleAuthCodeInput = z.infer<typeof googleAuthCodeInputSchema>;

/** Body of `POST /api/orders`. */
export const orderCreateInputSchema = z.object({
  customerName: z.string().trim().min(1).max(255),
  customerEmail: z.email().max(255),
  customerPhone: z.string().trim().max(32).optional(),
  serviceType: serviceTypeSchema,
  quantity: z.int().min(1),
  specNotes: z.string().trim().max(4000).optional(),
  paymentMethod: paymentMethodSchema,
});
export type OrderCreateInput = z.infer<typeof orderCreateInputSchema>;

/** Body of `PATCH /api/orders/:id/status`. */
export const orderStatusUpdateInputSchema = z.object({
  status: orderStatusSchema,
});
export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateInputSchema>;

/** Query of `GET /api/orders`. */
export const orderListQuerySchema = z.object({
  status: orderStatusSchema.optional(),
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

/** Body of `POST /internal/orders/:id/files` (file-intake -> orders-api). */
export const fileRegistrationInputSchema = z.object({
  objectKey: z.string().trim().min(1).max(512),
  originalFilename: z.string().trim().min(1).max(255),
  sizeBytes: z.int().min(0),
});
export type FileRegistrationInput = z.infer<typeof fileRegistrationInputSchema>;

/** Body of `POST /internal/upload-credentials/verify`. */
export const uploadCredentialsVerifyInputSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1),
});
export type UploadCredentialsVerifyInput = z.infer<typeof uploadCredentialsVerifyInputSchema>;

/** Body of `POST /internal/auth/verify-credentials` (web BFFs -> orders-api). */
export const userCredentialsVerifyInputSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1),
});
export type UserCredentialsVerifyInput = z.infer<typeof userCredentialsVerifyInputSchema>;

/** Response body of a successful `POST /internal/auth/verify-credentials`. */
export const userCredentialsSchema = z.object({
  userId: z.int(),
  username: z.string(),
  role: userRoleSchema,
});
export type UserCredentials = z.infer<typeof userCredentialsSchema>;

/** `uploadInstructions` block returned once by `POST /api/orders`. */
export const uploadInstructionsSchema = z.object({
  host: z.string(),
  port: z.int(),
  username: z.string(),
  password: z.string(),
  expiresAt: z.iso.datetime(),
});
export type UploadInstructions = z.infer<typeof uploadInstructionsSchema>;

/** A full `Order` row as returned by `GET /api/orders/:id` and `GET /api/orders`. */
export const orderSchema = z.object({
  id: z.int(),
  customerId: z.int().nullable(),
  serviceType: serviceTypeSchema,
  quantity: z.int(),
  specNotes: z.string().nullable(),
  paymentMethod: paymentMethodSchema,
  priceCents: z.int().nullable(),
  status: orderStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  pickupReadyAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
});
export type Order = z.infer<typeof orderSchema>;

/** Data payload shapes `orders-api` sends to `services/notify`'s `POST /internal/send`. */
export const emailTemplateDataSchemas = {
  'order-confirmation': z.object({
    orderId: z.int(),
    customerName: z.string(),
    serviceType: serviceTypeSchema,
    quantity: z.int(),
    uploadInstructions: uploadInstructionsSchema,
  }),
  'files-received': z.object({
    orderId: z.int(),
    customerName: z.string(),
  }),
  'ready-for-pickup': z.object({
    orderId: z.int(),
    customerName: z.string(),
    serviceType: serviceTypeSchema,
  }),
  'incident-notice': z.object({
    orderId: z.int(),
    customerName: z.string(),
    message: z.string(),
  }),
} as const;
export type EmailTemplateDataFor<T extends keyof typeof emailTemplateDataSchemas> = z.infer<
  (typeof emailTemplateDataSchemas)[T]
>;

/** Body of `notify`'s `POST /internal/send`. */
export const notifySendInputSchema = z.discriminatedUnion('template', [
  z.object({
    template: z.literal('order-confirmation'),
    to: z.email(),
    data: emailTemplateDataSchemas['order-confirmation'],
  }),
  z.object({
    template: z.literal('files-received'),
    to: z.email(),
    data: emailTemplateDataSchemas['files-received'],
  }),
  z.object({
    template: z.literal('ready-for-pickup'),
    to: z.email(),
    data: emailTemplateDataSchemas['ready-for-pickup'],
  }),
  z.object({
    template: z.literal('incident-notice'),
    to: z.email(),
    data: emailTemplateDataSchemas['incident-notice'],
  }),
]);
export type NotifySendInput = z.infer<typeof notifySendInputSchema>;
