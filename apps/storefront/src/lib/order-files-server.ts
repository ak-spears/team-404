import type { FileCaller } from './file-access';
import { callOrdersApi } from './internal-api';
import type { OrderFile } from './order-files';

interface OrdersApiFileRecord {
  id: number;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
}

export type OrderFilesResult =
  | { ok: true; files: OrderFile[] }
  | { ok: false; status: number; error: string };

/**
 * Lists an order's files for the order page and the files BFF route. A failure comes back as
 * `ok: false` -- never as an empty list, which would tell the customer they uploaded nothing.
 * Server-only.
 */
export async function listOrderFiles(orderId: number, caller: FileCaller): Promise<OrderFilesResult> {
  let result;
  try {
    result = await callOrdersApi<OrdersApiFileRecord[] | { error?: string }>({
      method: 'GET',
      path: `/api/orders/${orderId}/files`,
      role: caller.role,
      userId: caller.userId,
    });
  } catch (err) {
    console.error('listOrderFiles: orders-api unreachable', {
      orderId,
      errorName: err instanceof Error ? err.name : 'UnknownError',
    });
    return { ok: false, status: 502, error: 'files_unavailable' };
  }

  if (result.status !== 200 || !Array.isArray(result.body)) {
    const error = !Array.isArray(result.body) && result.body?.error ? result.body.error : 'files_unavailable';
    return { ok: false, status: result.status === 200 ? 502 : result.status, error };
  }

  // A link is shown only to a caller who could plausibly be entitled to the bytes -- an
  // identified user or a holder of this order's upload cookie. The download route asks
  // orders-api again either way; this only avoids offering links that would certainly 403.
  const mayDownload = caller.role !== undefined || caller.uploadToken !== undefined;
  const files = result.body.map((file) => ({
    id: file.id,
    originalFilename: file.originalFilename,
    sizeBytes: file.sizeBytes,
    uploadedAt: file.uploadedAt,
    url: mayDownload ? `/api/orders/${orderId}/files/${file.id}` : undefined,
  }));
  return { ok: true, files };
}
