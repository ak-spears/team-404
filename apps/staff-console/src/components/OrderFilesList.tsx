'use client';

import { useEffect, useState } from 'react';
import { BASE_PATH } from '../lib/base-path';

interface OrderFileLink {
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
  url: string;
}

function isOrderFileLinks(value: unknown): value is { files: OrderFileLink[] } {
  return typeof value === 'object' && value !== null && Array.isArray((value as { files?: unknown }).files);
}

/**
 * Fetches presigned MinIO links via this app's own BFF route. Polls every 30 seconds so a
 * file that lands after the page loads still shows up without a manual refresh.
 */
export function OrderFilesList({ orderId }: { orderId: number }) {
  const [files, setFiles] = useState<OrderFileLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Client fetch() is not basePath-aware -- prefix so this hits /staff/api/... (see
    // src/lib/base-path.ts).
    fetch(`${BASE_PATH}/api/orders/${orderId}/files`)
      .then(async (response) => {
        const body: unknown = await response.json();
        if (cancelled) return;
        if (!response.ok || !isOrderFileLinks(body)) {
          setError('No files available yet.');
          return;
        }
        setFiles(body.files);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load files.');
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (error) return <p className="muted">{error}</p>;
  if (!files) return <p className="muted">Loading files...</p>;
  if (files.length === 0) return <p className="muted">No files uploaded yet.</p>;

  return (
    <ul className="files-list">
      {files.map((file) => (
        <li key={file.originalFilename}>
          <a href={file.url} target="_blank" rel="noreferrer">
            {file.originalFilename}
          </a>{' '}
          <span className="muted">
            ({file.sizeBytes} bytes, uploaded {new Date(file.uploadedAt).toLocaleString()})
          </span>
        </li>
      ))}
    </ul>
  );
}
