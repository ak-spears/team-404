import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../lib/session";

/** Signed out via a plain form POST -- no client JS required. */
export async function POST(request: Request): Promise<NextResponse> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
