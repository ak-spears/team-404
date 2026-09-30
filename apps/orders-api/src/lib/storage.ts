import { Client } from 'minio';
import type { Config } from '../config.js';

/**
 * Per-file upload ceiling. Enforced by @fastify/multipart on the incoming stream (app.ts) and
 * reported to the caller by the upload route -- keep the two in step by importing this.
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

let cachedClient: Client | undefined;

/**
 * orders-api is the only service that WRITES to MinIO, the same way it is the only service
 * that writes to MySQL -- staff-console holds read-only credentials for presigning downloads
 * and never puts an object itself.
 */
export function getStorageClient(config: Config): Client {
  if (cachedClient) return cachedClient;
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
 * Creates the uploads bucket when it isn't there yet. Idempotent, so it is safe to call on
 * every boot: a fresh clone (or a rebuilt VM) gets a working bucket without anyone clicking
 * through the MinIO console first.
 */
export async function ensureBucket(config: Config): Promise<void> {
  const client = getStorageClient(config);
  if (await client.bucketExists(config.MINIO_BUCKET)) return;
  await client.makeBucket(config.MINIO_BUCKET);
  console.log('created MinIO bucket', { bucket: config.MINIO_BUCKET });
}
