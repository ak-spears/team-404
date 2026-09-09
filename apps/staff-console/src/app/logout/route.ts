import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loadConfig } from "../../lib/config";
import { SESSION_COOKIE_NAME } from "../../lib/session";

/** Signed out via a plain form POST -- no client JS required. Lands on the main site. */
export async function POST(): Promise<NextResponse> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  // Back to the main Crimson Copies site. STOREFRONT_URL is "/" on the VM (Caddy routes it)
  // and an absolute http://localhost:3000/ in local dev -- either is a valid Location.
  const { STOREFRONT_URL } = loadConfig();
  return new NextResponse(null, {
    status: 303,
    headers: { Location: STOREFRONT_URL },
  });
}
