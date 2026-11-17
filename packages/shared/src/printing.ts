/**
 * Uploaded-file formats a browser can both render inline AND print from a hidden frame.
 *
 * One list serving two sides of the same decision:
 *
 * - orders-api serves these WITHOUT `Content-Security-Policy: sandbox`, because a sandboxed
 *   document is opaque to the page that embeds it -- a browser PDF viewer can render blank in
 *   one, and a parent frame cannot call `print()` into one at all.
 * - staff-console marks these as printable, so the staff console only offers "Print" on a file
 *   it can actually put in front of a printer.
 *
 * Keeping it in one place is the point: drop a format here and orders-api would sandbox it
 * while the console still offered a Print button that silently did nothing.
 *
 * Everything else still opens in a tab -- it is just printed from whatever app opens it.
 * `svg`/`html`/`xml` are forced to download entirely (they execute script); see
 * NEVER_INLINE_EXTENSIONS in orders-api.
 */
export const BROWSER_PRINTABLE_EXTENSIONS = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'tif',
  'tiff',
] as const;

export type BrowserPrintableExtension = (typeof BROWSER_PRINTABLE_EXTENSIONS)[number];

/** Lowercased extension without the dot; '' when the name has none. */
export function fileExtensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

/** Whether a browser can render this file inline and print it without opening another app. */
export function isBrowserPrintable(filename: string): boolean {
  return (BROWSER_PRINTABLE_EXTENSIONS as readonly string[]).includes(fileExtensionOf(filename));
}
