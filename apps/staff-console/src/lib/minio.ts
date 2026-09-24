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
export async function presignFileUrl(objectKey: string): Promise<string> {
  const config = loadConfig();
  return getClient().presignedGetObject(config.MINIO_BUCKET, objectKey, PRESIGN_EXPIRY_SECONDS);
}
