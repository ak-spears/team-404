'use client';

import { useState, useTransition } from 'react';
import type { OrderFileLink } from '../lib/order-files';
import { printFile } from '../lib/print-file';

/**
 * Prints the order receipt -- the job ticket that goes in the bag.
 *
 * There is no separate print page: the order detail page IS the ticket, and the `@media
 * print` block in globals.css hides the screen chrome around it (header nav, these page
 * actions, the status form). One source of truth means a field added to the order page
 * cannot quietly go missing from the printout.
 *
 * This is a client component purely because `window.print()` needs a browser -- the page it
 * sits on stays a server component.
 */
export function PrintReceiptButton() {
  return (
    <button type="button" className="btn btn-on-crimson" onClick={() => window.print()}>
      Print receipt
    </button>
  );
}

/**
 * Prints the customer's uploaded artwork -- the thing the shop is actually being paid to
 * print, as opposed to the receipt above.
 *
 * Disabled, with the reason in a tooltip, when there is nothing it can print: an order whose
 * files have not arrived yet, or one whose only uploads are formats a browser cannot render
 * (a .docx, a .zip). Staff open those from the file list and print them from the application
 * that owns them.
 *
 * With several printable files this prints the first and the file list carries a Print action
 * per row, which is the only way to say "that one" when an order has more than one.
 */
export function PrintFileButton({ files }: { files: OrderFileLink[] | null }) {
  const printable = files?.filter((file) => file.printable) ?? [];
  const target = printable[0];

  const disabledReason =
    files === null
      ? 'The file list could not be loaded.'
      : files.length === 0
        ? 'No files have been uploaded for this order yet.'
        : 'None of the uploaded files can be printed from the browser -- open one from the file list instead.';

  if (!target) {
    return (
      <button type="button" className="btn btn-on-crimson" disabled title={disabledReason}>
        Print file
      </button>
    );
  }

  return <PrintFileAction file={target} multiple={printable.length > 1} />;
}

/**
 * The live Print file button.
 *
 * Whether a file is printable is decided from its name, which cannot know the bytes are still
 * in storage -- so printFile checks, and anything it refuses has to be said out loud here. A
 * button that quietly does nothing is worse than no button: staff would stand at the printer
 * waiting for a sheet that was never sent.
 */
function PrintFileAction({ file, multiple }: { file: OrderFileLink; multiple: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await printFile(file.url);
      if (!result.ok) setError(result.reason);
    });
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-on-crimson"
        onClick={handleClick}
        disabled={isPending}
        title={
          multiple
            ? `Prints ${file.originalFilename}. Use the file list to print a different one.`
            : `Prints ${file.originalFilename}.`
        }
      >
        {isPending ? 'Opening...' : 'Print file'}
      </button>
      {error && (
        <p className="band-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
