// orders-api still mints and returns real one-time SFTP credentials, but this component
// intentionally doesn't show them -- there's no server listening on the other end yet.
/** Placeholder for the upload-instructions card until file upload is wired up. */
export function UploadInstructionsCard() {
  return (
    <div className="upload-instructions">
      <h3>File upload</h3>
      <p>File upload: coming soon.</p>
    </div>
  );
}
