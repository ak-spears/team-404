import { Client } from 'minio';
import { loadConfig } from './config';

/** 15 minutes -- short-lived enough that a leaked link isn't a standing access grant. */
const PRESIGN_EXPIRY_SECONDS = 15 * 60;

let cachedClient: Client | undefined;

function getClient(): Client {
  if (cachedClient) return cachedClient;
  const config = loadConfig();
  cachedClient = new Client({
    endPoint: config.MINIO_ENDPOINT,
    port: config.MINIO_PORT,
    useSSL: config.MINIO_USE_SSL,
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
