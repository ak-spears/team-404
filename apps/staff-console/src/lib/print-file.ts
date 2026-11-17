'use client';

export type PrintFileResult = { ok: true } | { ok: false; reason: string };

/**
 * Content types a browser renders as a document we can print. Anything else coming back --
 * `application/json` above all -- means the download route answered with an error payload
 * rather than the file, and printing it would put that payload on paper.
 */
function isPrintableResponse(contentType: string | null): boolean {
  if (!contentType) return false;
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return type === 'application/pdf' || type.startsWith('image/');
}

/**
 * Sends an uploaded order file to the printer.
 *
 * The file is loaded into an offscreen same-origin iframe and printed from there, so what
 * reaches the printer is the artwork itself -- the customer's PDF or image -- and not the
 * staff page around it. That also means the page's own `@media print` rules do not apply:
 * the iframe is a separate document and prints as itself.
 *
 * Same-origin is what makes this work at all. The file is served by this app's own download
 * route (app/api/orders/[id]/files/[fileId]), which streams the bytes from orders-api, and
 * orders-api deliberately omits `Content-Security-Policy: sandbox` for printable formats --
 * a sandboxed document is opaque, and `contentWindow.print()` into one throws.
 *
 * The HEAD probe is not optional. Whether a file is printable is otherwise decided from its
 * NAME (see lib/order-files.ts), which says nothing about whether the bytes are still there:
 * an object missing from storage answers 404 with a JSON body, the iframe renders that JSON
 * happily, and the print dialog opens on a page reading {"error":"not_found"}. HEAD returns
 * the real status and Content-Type without downloading anything, so the failure is caught
 * before a dialog -- or a sheet of paper -- is spent on it.
 */
export async function printFile(url: string): Promise<PrintFileResult> {
  let probe: Response;
  try {
    probe = await fetch(url, { method: 'HEAD', credentials: 'same-origin' });
  } catch {
    return { ok: false, reason: 'Could not reach the file. Check your connection and try again.' };
  }

  if (!probe.ok) {
    return {
      ok: false,
      reason:
        probe.status === 404
          ? 'This file is no longer in storage, so there is nothing to print.'
          : `The file could not be loaded (error ${probe.status}).`,
    };
  }

  if (!isPrintableResponse(probe.headers.get('content-type'))) {
    return {
      ok: false,
      reason: 'This file cannot be printed from the browser -- open it to print it instead.',
    };
  }

  return new Promise<PrintFileResult>((resolve) => {
    const frame = document.createElement('iframe');
    // Not display:none -- a hidden frame is not laid out, and some browsers then print it blank.
    frame.setAttribute('aria-hidden', 'true');
    frame.className = 'print-frame';

    const cleanUp = () => {
      // Removing the frame while the print dialog is still open cancels the job, so this only
      // ever runs after afterprint, or well after the dialog had to have been dismissed.
      frame.remove();
    };

    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        cleanUp();
        window.open(url, '_blank', 'noopener');
        resolve({ ok: false, reason: 'The file could not be opened for printing.' });
        return;
      }

      try {
        win.addEventListener('afterprint', cleanUp, { once: true });
        win.focus();
        win.print();
        // afterprint does not fire everywhere (and never, if the dialog is dismissed oddly),
        // so this is the backstop that stops frames piling up on the page.
        window.setTimeout(cleanUp, 60_000);
        resolve({ ok: true });
      } catch {
        // Blocked or opaque for any reason: fall back to opening the file so staff still have
        // a way to print it, rather than a button that silently does nothing.
        cleanUp();
        window.open(url, '_blank', 'noopener');
        resolve({ ok: false, reason: 'Printing was blocked, so the file was opened instead.' });
      }
    };

    frame.onerror = () => {
      cleanUp();
      resolve({ ok: false, reason: 'The file could not be loaded for printing.' });
    };

    frame.src = url;
    document.body.appendChild(frame);
  });
}
