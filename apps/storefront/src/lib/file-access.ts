import { loadConfig } from './config';
import { getAuthenticatedUser } from './customer-identity';
import { readUploadTokenCookie } from './upload-token-cookie';

export interface FileCaller {
  role: 'customer' | 'staff' | undefined;
  userId: string | undefined;
  /** Present when this browser holds the order's upload-credential cookie. Never log it. */
  uploadToken: string | undefined;
}

/** Everything orders-api needs to decide whether this caller may touch an order's files. */
export async function getFileCaller(): Promise<FileCaller> {
  const user = await getAuthenticatedUser();
  return { role: user.role, userId: user.userId, uploadToken: await readUploadTokenCookie() };
}

/**
 * Headers for a raw fetch() to orders-api's file routes -- callOrdersApi() is JSON-only, and
 * uploads/downloads are streams. Server-only: carries INTERNAL_API_KEY.
 */
export function ordersApiFileHeaders(caller: FileCaller): Record<string, string> {
  const headers: Record<string, string> = { 'X-Internal-Key': loadConfig().INTERNAL_API_KEY };
  if (caller.role) headers['X-User-Role'] = caller.role;
  if (caller.userId) headers['X-User-Id'] = caller.userId;
  if (caller.uploadToken) headers['X-Upload-Token'] = caller.uploadToken;
  return headers;
}

/** Order and file ids are positive integers; anything else never reaches orders-api's URL. */
export function isPositiveIntegerId(value: string): boolean {
  return /^[1-9]\d{0,15}$/.test(value);
}
