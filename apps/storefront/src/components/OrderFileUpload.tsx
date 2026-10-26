'use client';

import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import {
  ACCEPTED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  filesLoadErrorMessage,
  uploadErrorMessage,
  uploadOrderFile,
  type OrderFile,
} from '../lib/order-files';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isOrderFiles(value: unknown): value is { files: OrderFile[] } {
  return typeof value === 'object' && value !== null && Array.isArray((value as { files?: unknown }).files);
}

/** The list is either loaded or failed -- a failure is never shown as "no files". */
type FileListState = { kind: 'ready'; files: OrderFile[] } | { kind: 'error'; message: string };

type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; fileName: string; percent: number }
  | { kind: 'success'; fileName: string }
  | { kind: 'error'; message: string };

export interface UploadNotice {
  kind: 'success' | 'error';
  text: string;
}

interface OrderFileUploadProps {
  orderId: number;
  /** Loaded server-side on every render of the order page, so a refresh always shows the truth. */
  initialFiles: OrderFile[] | null;
  /** Set instead of initialFiles when the server-side load failed. */
  initialLoadError: string | null;
  /** Outcome of the upload that ran during checkout, carried over the redirect to this page. */
  initialNotice?: UploadNotice | undefined;
}

/**
 * Customer-side file upload for an existing order: adding more files, or retrying one that
 * failed during checkout. Posts to the storefront's own BFF route, which forwards to
 * orders-api -- the browser never touches MinIO.
 */
export function OrderFileUpload({ orderId, initialFiles, initialLoadError, initialNotice }: OrderFileUploadProps) {
  const [list, setList] = useState<FileListState>(
    initialFiles
      ? { kind: 'ready', files: initialFiles }
      : { kind: 'error', message: initialLoadError ?? filesLoadErrorMessage(0) },
  );
  const [upload, setUpload] = useState<UploadState>(() => {
    if (initialNotice?.kind === 'success') return { kind: 'success', fileName: initialNotice.text };
    if (initialNotice?.kind === 'error') return { kind: 'error', message: initialNotice.text };
    return { kind: 'idle' };
  });
  const [selected, setSelected] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reloadFiles = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${orderId}/files`, { cache: 'no-store' });
      const body: unknown = await response.json().catch(() => undefined);
      if (response.ok && isOrderFiles(body)) {
        setList({ kind: 'ready', files: body.files });
      } else {
        setList({ kind: 'error', message: filesLoadErrorMessage(response.status) });
      }
    } catch {
      setList({ kind: 'error', message: filesLoadErrorMessage(0) });
    }
  }, [orderId]);

  function handleFileChosen(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    // Caught here as well as server-side, so an oversized file fails instantly instead of
    // after the customer waits out a 50MB upload that was always going to be rejected.
    if (file && file.size > MAX_UPLOAD_BYTES) {
      setUpload({ kind: 'error', message: uploadErrorMessage(413) });
      setSelected(null);
      event.target.value = '';
      return;
    }
    setSelected(file);
    setUpload({ kind: 'idle' });
  }

  async function handleUpload(): Promise<void> {
    if (!selected) return;
    const file = selected;

    setUpload({ kind: 'uploading', fileName: file.name, percent: 0 });
    const outcome = await uploadOrderFile(orderId, file, (percent) =>
      setUpload({ kind: 'uploading', fileName: file.name, percent }),
    );

    if (outcome.ok) {
      setUpload({ kind: 'success', fileName: file.name });
      // The picker is cleared only once the file is safely stored; on failure it keeps the
      // file so "Upload" can simply be pressed again.
      setSelected(null);
      if (inputRef.current) inputRef.current.value = '';
    } else {
      setUpload({ kind: 'error', message: uploadErrorMessage(outcome.status) });
    }
    await reloadFiles();
  }

  const uploading = upload.kind === 'uploading';

  return (
    <div className="upload-instructions">
      <h3>Your Files</h3>

      {list.kind === 'error' ? (
        <p className="error" role="alert">
          {list.message}
        </p>
      ) : list.files.length === 0 ? (
        <p className="muted">No files uploaded yet. Add the artwork or document to print.</p>
      ) : (
        <ul className="files-list">
          {list.files.map((file) => (
            <li key={file.id}>
              {file.url ? (
                <a href={file.url} target="_blank" rel="noreferrer">
                  {file.originalFilename}
                </a>
              ) : (
                file.originalFilename
              )}{' '}
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
      <button type="button" onClick={() => void handleUpload()} disabled={!selected || uploading}>
        {uploading ? 'Uploading...' : 'Upload'}
      </button>

      {upload.kind === 'uploading' && (
        <p className="upload-progress" role="status">
          <progress value={upload.percent} max={100} /> Uploading {upload.fileName}... {upload.percent}%
        </p>
      )}
      {upload.kind === 'success' && (
        <p className="success" role="status">
          Uploaded {upload.fileName}.
        </p>
      )}
      {upload.kind === 'error' && (
        <p className="error" role="alert">
          {upload.message}
        </p>
      )}
    </div>
  );
}
