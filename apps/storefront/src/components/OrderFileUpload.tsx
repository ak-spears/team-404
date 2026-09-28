'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  ACCEPTED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  uploadErrorMessage,
  uploadOrderFile,
} from '../lib/order-files';

interface OrderFile {
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
  /** Presigned, 15-minute MinIO link -- lets the customer open what they uploaded. */
  url: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isOrderFiles(value: unknown): value is { files: OrderFile[] } {
  return typeof value === 'object' && value !== null && Array.isArray((value as { files?: unknown }).files);
}

interface OrderFileUploadProps {
  orderId: number;
  /** Bump to re-read the file list -- the order form uses it after its own upload finishes. */
  reloadKey?: number;
  /** Guest checkout's proof of ownership; omitted for a signed-in customer. */
  uploadToken?: string;
}

/**
 * Customer-side file upload for an existing order: adding more files, or retrying one that
 * failed during checkout. Posts to the storefront's own BFF route, which forwards to
 * orders-api -- the browser never touches MinIO.
 */
export function OrderFileUpload({ orderId, reloadKey = 0, uploadToken }: OrderFileUploadProps) {
  const [files, setFiles] = useState<OrderFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${orderId}/files`);
      const body: unknown = await response.json();
      setFiles(response.ok && isOrderFiles(body) ? body.files : []);
    } catch {
      setFiles([]);
    }
  }, [orderId]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles, reloadKey]);

  async function handleFileChosen(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    // Caught here as well as server-side, so an oversized file fails instantly instead of
    // after the customer waits out a 50MB upload that was always going to be rejected.
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(uploadErrorMessage(413));
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setPercent(0);
    const outcome = await uploadOrderFile(orderId, file, setPercent, uploadToken);
    setPercent(null);
    if (inputRef.current) inputRef.current.value = '';

    if (outcome.ok) {
      void loadFiles();
      return;
    }
    setError(uploadErrorMessage(outcome.status));
  }

  const uploading = percent !== null;

  return (
    <div className="upload-instructions">
      <h3>Your files</h3>

      {files === null ? (
        <p className="muted">Loading files...</p>
      ) : files.length === 0 ? (
        <p className="muted">No files uploaded yet. Add the artwork or document to print.</p>
      ) : (
        <ul className="files-list">
          {files.map((file) => (
            <li key={`${file.originalFilename}-${file.uploadedAt}`}>
              <a href={file.url} target="_blank" rel="noreferrer">
                {file.originalFilename}
              </a>{' '}
              <span className="muted">
                ({formatBytes(file.sizeBytes)}, uploaded {new Date(file.uploadedAt).toLocaleString()})
              </span>
            </li>
          ))}
        </ul>
      )}

      <label className="file-picker">
        <span className="muted">Documents or images, up to 50 MB each.</span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          disabled={uploading}
          onChange={handleFileChosen}
        />
      </label>

      {uploading && (
        <p className="upload-progress" role="status">
          <progress value={percent} max={100} /> Uploading... {percent}%
        </p>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
