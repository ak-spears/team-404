import { isBrowserPrintable } from '@crimson-copies/shared';
import { BASE_PATH } from './base-path';
import { callOrdersApi } from './internal-api';

export interface OrderFileRecord {
  id: number;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface OrderFileLink extends OrderFileRecord {
  /** Points at this app's own download route, never at MinIO -- see loadOrderFiles. */
  url: string;
  /**
   * Whether the browser can render and print this file directly. Decided here, from the
   * filename, so the UI never offers a Print button that would open a dialog on a blank
   * frame -- a .docx or .zip has to be opened in its own application instead.
   */
  printable: boolean;
}

export type OrderFilesResult = { ok: true; files: OrderFileLink[] } | { ok: false; status: number };

/**
 * Loads an order's files from orders-api and links each one to this app's own download route
 * (app/api/orders/[id]/files/[fileId]/route.ts). MinIO listens on 127.0.0.1 only, so a
 * presigned MinIO link would be unreachable from a staff browser.
 *
 * Shared by the order page (server-side, so the job ticket never prints a loading
 * placeholder) and the BFF route the client list refreshes from. Both must mint identical
 * URLs, which is the reason this lives in one place rather than in each caller.
 *
 * Returns a result rather than throwing: a failed request is an error the caller has to show,
 * never an empty list -- staff would otherwise tell a customer nothing arrived when the list
 * simply could not be read.
 */
export async function loadOrderFiles(
  orderId: number | string,
  session: { role: 'staff' | 'customer'; userId: number },
): Promise<OrderFilesResult> {
  const result = await callOrdersApi<OrderFileRecord[]>({
    method: 'GET',
    path: `/api/orders/${orderId}/files`,
    role: session.role,
    userId: String(session.userId),
  });

  if (result.status !== 200 || !Array.isArray(result.body)) {
    return { ok: false, status: result.status === 200 ? 502 : result.status };
  }

  return {
    ok: true,
    // Client-side links are not basePath-aware, so the /staff prefix is spelled out here.
    files: result.body.map((file) => ({
      id: file.id,
      originalFilename: file.originalFilename,
      sizeBytes: file.sizeBytes,
      uploadedAt: file.uploadedAt,
      url: `${BASE_PATH}/api/orders/${orderId}/files/${file.id}`,
      printable: isBrowserPrintable(file.originalFilename),
    })),
  };
}
