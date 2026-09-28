/**
 * Browser-side helpers for uploading a file to an order. Shared by the order form (which
 * uploads automatically right after creating the order) and the upload card (which handles
 * later additions and retries), so both speak about failures in the same words.
 *
 * Client-only -- imported from 'use client' components; nothing here touches server config.
 */

/** Mirrors orders-api's ALLOWED_FILE_EXTENSIONS -- a hint for the file picker, not the check. */
export const ACCEPTED_EXTENSIONS =
  '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf,.csv,.png,.jpg,.jpeg,.gif,.bmp,.tif,.tiff,.svg,.eps,.ai,.psd,.zip';

/** Mirrors MAX_UPLOAD_BYTES in orders-api (apps/orders-api/src/lib/storage.ts). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Each case corresponds to a status orders-api's upload route actually returns. */
export function uploadErrorMessage(status: number): string {
  switch (status) {
    case 0:
      return 'Network error -- please try again.';
    case 403:
      return "This order isn't associated with your account -- sign in with the account that placed it.";
    case 404:
      return 'That order no longer exists.';
    case 413:
      return 'That file is too large -- the limit is 50 MB.';
    case 415:
      return "That file type isn't accepted. Upload a document or an image.";
    case 503:
      return 'File storage is unavailable right now. Please try again shortly.';
    default:
      return 'Upload failed. Please try again.';
  }
}

export interface UploadOutcome {
  ok: boolean;
  /** HTTP status, or 0 when the request never completed. */
  status: number;
}

/**
 * Uploads one file to the storefront's BFF route. Resolves rather than rejects on failure --
 * callers decide how to present it, and an order that was already created must never be
 * reported to the customer as a failure just because its file didn't make it.
 *
 * XMLHttpRequest rather than fetch(): fetch still reports no upload progress, and a print file
 * large enough to matter is exactly when someone needs to see that it is moving.
 */
export function uploadOrderFile(
  orderId: number,
  file: File,
  onProgress: (percent: number) => void,
  /**
   * The one-time credential returned when the order was placed. A signed-in customer doesn't
   * need it -- their session identifies them -- but a guest has nothing else to prove the
   * order is theirs, and orders-api refuses anonymous uploads without it.
   */
  uploadToken?: string,
): Promise<UploadOutcome> {
  return new Promise((resolve) => {
    const body = new FormData();
    body.append('file', file);

    const request = new XMLHttpRequest();
    request.open('POST', `/api/orders/${orderId}/files`);
    if (uploadToken) request.setRequestHeader('X-Upload-Token', uploadToken);
    request.upload.addEventListener('progress', (progress) => {
      if (progress.lengthComputable) {
        onProgress(Math.round((progress.loaded / progress.total) * 100));
      }
    });
    request.addEventListener('load', () => {
      resolve({ ok: request.status === 201, status: request.status });
    });
    request.addEventListener('error', () => resolve({ ok: false, status: 0 }));
    request.send(body);
  });
}
