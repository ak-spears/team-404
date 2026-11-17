'use client';

import { useEffect, useState } from 'react';
import { BASE_PATH } from '../lib/base-path';
import type { OrderFileLink } from '../lib/order-files';
import { printFile } from '../lib/print-file';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isOrderFileLinks(value: unknown): value is { files: OrderFileLink[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { files?: unknown }).files)
  );
}

/**
 * The order's uploaded files.
 *
 * `initialFiles` comes from the page's own server-side load, so the list is already populated
 * in the first HTML. That is what makes the page printable: staff can hit Print the moment it
 * appears and the job ticket carries the real file list, where a client-only fetch would have
 * printed "Loading files..." if the request had not landed yet.
 *
 * It still refreshes on mount, so a file that arrived between the server render and the page
 * becoming interactive shows up without a manual reload. A failed refresh leaves the
 * server-rendered list on screen rather than replacing it with an error -- the data is known
 * good, it is just no longer known current.
 */
export function OrderFilesList({
  orderId,
  initialFiles,
  initialError,
}: {
  orderId: number;
  initialFiles: OrderFileLink[] | null;
  /** Set when the server-side load failed, so the page renders the error without a round trip. */
  initialError?: string | undefined;
}) {
  const [files, setFiles] = useState<OrderFileLink[] | null>(initialFiles);
  const [error, setError] = useState<string | null>(initialError ?? null);
  /** Per-file print failures, keyed by file id -- see printFile for what it refuses. */
  const [printErrors, setPrintErrors] = useState<Record<number, string>>({});

  // Whether the server render already produced a list. A prop, so the effect below can read
  // it without capturing `files` from the render it was created in.
  const hasServerFiles = initialFiles !== null;

  useEffect(() => {
    let cancelled = false;
    // Client fetch() is not basePath-aware -- prefix so this hits /staff/api/... (see
    // src/lib/base-path.ts).
    fetch(`${BASE_PATH}/api/orders/${orderId}/files`)
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => undefined);
        if (cancelled) return;
        if (!response.ok || !isOrderFileLinks(body)) {
          // Only surface a refresh failure when there is nothing to show. A failed request is
          // an error, never "no files" -- staff would otherwise tell a customer nothing
          // arrived when the list simply couldn't be read.
          if (!hasServerFiles) {
            setError(`Could not load files (error ${response.status}). Refresh to try again.`);
          }
          return;
        }
        setError(null);
        setFiles(body.files);
      })
      .catch(() => {
        if (cancelled) return;
        if (!hasServerFiles) {
          setError('Could not load files -- network error. Refresh to try again.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, hasServerFiles]);

  if (error) {
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  }
  if (!files) return <p className="muted">Loading files...</p>;
  if (files.length === 0) return <p className="muted">No files uploaded yet.</p>;

  return (
    <ul className="files-list">
      {files.map((file) => (
        <li key={file.id}>
          <a href={file.url} target="_blank" rel="noreferrer">
            {file.originalFilename}
          </a>
          <span className="muted">
            {formatBytes(file.sizeBytes)} &middot; uploaded{' '}
            {new Date(file.uploadedAt).toLocaleString()}
          </span>
          {/* Per-file, because the header's "Print file" can only ever mean one of them. */}
          {file.printable && (
            <button
              type="button"
              className="file-print"
              onClick={() => {
                setPrintErrors((current) => {
                  const next = { ...current };
                  delete next[file.id];
                  return next;
                });
                void printFile(file.url).then((result) => {
                  if (!result.ok) {
                    setPrintErrors((current) => ({ ...current, [file.id]: result.reason }));
                  }
                });
              }}
              title={`Print ${file.originalFilename}`}
            >
              Print
            </button>
          )}
          {printErrors[file.id] && (
            <p className="error file-print-error" role="alert">
              {printErrors[file.id]}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
