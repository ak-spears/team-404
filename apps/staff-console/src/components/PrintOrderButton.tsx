'use client';

/**
 * Opens the browser's print dialog for the order job ticket.
 *
 * There is no separate print page: the order detail page IS the ticket, and the `@media
 * print` block in globals.css hides the screen chrome around it (header nav, these page
 * actions, the status form). One source of truth means a field added to the order page
 * cannot quietly go missing from the printout.
 *
 * This is a client component purely because `window.print()` needs a browser -- the page it
 * sits on stays a server component.
 */
export function PrintOrderButton() {
  return (
    <button type="button" className="btn btn-on-crimson" onClick={() => window.print()}>
      Print
    </button>
  );
}
