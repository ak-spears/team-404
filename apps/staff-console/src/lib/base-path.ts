/**
 * URL prefix the staff console is mounted at.
 *
 * The VM has ONE public hostname (https://<team>.capstone.uamishub.com) and the free-plan
 * wildcard TLS certificate covers only a single label, so `staff.<team>.capstone.uamishub.com`
 * can never get a certificate -- a path prefix on the existing host is the only public route
 * that works. See docs/architecture.md sec. 1.
 *
 * This constant is the single source of truth. `next.config.ts` passes the same literal to
 * Next's `basePath`, which makes Next automatically prefix:
 *   - <Link href> and next/navigation redirect() / router navigation
 *   - every asset URL (/staff/_next/...) and API route registration
 *
 * Next does NOT rewrite the following, so prefix them with BASE_PATH by hand:
 *   - plain <form action="..."> targets
 *   - client-side fetch("/api/...") calls
 *   - NextResponse.redirect() in middleware / route handlers -- build the URL off
 *     request.nextUrl (which carries the basePath) instead of a bare `new URL(...)`.
 *
 * Keep this in sync with `basePath` in apps/staff-console/next.config.ts.
 */
export const BASE_PATH = "/staff";
