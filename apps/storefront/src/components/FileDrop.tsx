'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ACCEPTED_EXTENSIONS } from '../lib/order-files';
import { formatBytes } from './OrderFileUpload';

const ACCEPTED = new Set(ACCEPTED_EXTENSIONS.split(','));

interface FileDropProps {
  file: File | null;
  error: string | null;
  onFile: (file: File | null) => void;
  /** Called instead of onFile for a dropped file the picker's `accept` would have filtered out. */
  onRejected: (message: string) => void;
}

/** Click-or-drop file picker. Validation (size) stays with the caller. */
export function FileDrop({ file, error, onFile, onRejected }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // Keep the native input in step when the caller clears or rejects the file.
  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = '';
  }, [file]);

  function handleDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setOver(false);
    const dropped = event.dataTransfer.files[0];
    if (!dropped) return;
    const ext = dropped.name.slice(dropped.name.lastIndexOf('.')).toLowerCase();
    if (!ACCEPTED.has(ext)) {
      onRejected(`${dropped.name} isn't a supported file type.`);
      return;
    }
    onFile(dropped);
  }

  return (
    <div className="file-drop-field">
      <label
        className="file-drop"
        data-over={over || undefined}
        data-filled={file ? '' : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {file ? (
          <span className="file-drop-text">
            <strong>{file.name}</strong>
            <span>{formatBytes(file.size)} &middot; click to replace</span>
          </span>
        ) : (
          <span className="file-drop-text">
            <strong>
              Drop your file here or <u>browse</u>
            </strong>
            <span>PDF, Office docs, or images &middot; up to 50 MB</span>
          </span>
        )}
      </label>
      {file && (
        <button type="button" className="file-drop-clear" onClick={() => onFile(null)}>
          Remove
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
