import { Client } from 'minio';
import { loadConfig, type Config } from './config';

/** 15 minutes -- short-lived enough that a leaked link isn't a standing access grant. */
const PRESIGN_EXPIRY_SECONDS = 15 * 60;

let cachedClient: Client | undefined;

/**
 * Where a presigned link points. This is the staff browser's view of MinIO, which is not the
 * one this process uses: the signature covers the Host header, so the URL has to be signed for
 * the public host from the start. Falls back to the direct endpoint, which is correct in local
 * dev where the browser can reach MinIO itself.
 */
function publicEndpoint(config: Config): { endPoint: string; port: number; useSSL: boolean } {
  if (!config.MINIO_PUBLIC_ENDPOINT) {
    return {
      endPoint: config.MINIO_ENDPOINT,
      port: config.MINIO_PORT,
      useSSL: config.MINIO_USE_SSL,
    };
  }
  const useSSL = config.MINIO_PUBLIC_USE_SSL ?? config.MINIO_USE_SSL;
  return {
    endPoint: config.MINIO_PUBLIC_ENDPOINT,
    // Behind Caddy the port is the standard one for the scheme, so it need not be configured.
    port: config.MINIO_PUBLIC_PORT ?? (useSSL ? 443 : 80),
    useSSL,
  };
}

/**
 * Formats that execute script when a browser renders them inline. MinIO is served from the
 * site's own hostname (Caddy proxies /<bucket>/*), so an inline SVG runs its JavaScript on
 * THIS origin, with access to the cookies for it -- stored XSS by way of print artwork.
 * Forcing a download keeps the format usable without letting it execute. `nosniff` does not
 * help here: the content type is genuinely image/svg+xml.
 */
const NEVER_INLINE_EXTENSIONS = new Set(['svg', 'htm', 'html', 'xhtml', 'xml']);

function contentDisposition(originalFilename: string): string {
  const dot = originalFilename.lastIndexOf('.');
  const extension = dot === -1 ? '' : originalFilename.slice(dot + 1).toLowerCase();
  const mode = NEVER_INLINE_EXTENSIONS.has(extension) ? 'attachment' : 'inline';
  // orders-api already reduced the stored name to [A-Za-z0-9._-], so it is safe unquoted-ish
  // here; quoting it anyway keeps the header well-formed.
  return `${mode}; filename="${originalFilename}"`;
}

function getClient(): Client {
  if (cachedClient) return cachedClient;
  const config = loadConfig();
  cachedClient = new Client({
    ...publicEndpoint(config),
    accessKey: config.MINIO_ACCESS_KEY,
    secretKey: config.MINIO_SECRET_KEY,
  });
  return cachedClient;
}

/**
 * Mints a short-lived presigned GET URL for an uploaded order file. MinIO isn't behind
 * orders-api's single-writer MySQL boundary, so staff-console talks to it directly with its
 * own read-only credentials -- it never needs orders-api to proxy the bytes.
 */
export async function presignFileUrl(objectKey: string, originalFilename: string): Promise<string> {
  const config = loadConfig();
  // The signed response headers also restore the ORIGINAL filename: the object key carries a
  // uuid prefix, which is not what anyone wants their download called.
  return getClient().presignedGetObject(config.MINIO_BUCKET, objectKey, PRESIGN_EXPIRY_SECONDS, {
    'response-content-disposition': contentDisposition(originalFilename),
  });
}
