
import { isAllowedLoginUsername } from "@crimson-copies/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { callOrdersApi } from "../../lib/internal-api";
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "../../lib/session";

// Reads searchParams for the error/next state below -- must always be rendered per-request.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ error?: string; next?: string }>;
}

interface LoginResponseBody {
  userId: number;
  username: string;
  role: "customer" | "staff";
}

// The post-login destination arrives from the query string, so it is attacker-controlled.
// Only a same-site, path-only destination is ever allowed: resolve it against a throwaway
// origin and require the origin to survive unchanged. That rejects "https://evil.example.com",
// the protocol-relative "//evil.example.com", the backslash form "/\\evil.example.com" and
// tab/newline-smuggled variants, all of which browsers resolve off-site.
const NEXT_FALLBACK = "/";

function safeNextPath(raw: unknown): string {
  const value = typeof raw === "string" ? raw : "";
  if (!value.startsWith("/") || value.startsWith("//")) {
    return NEXT_FALLBACK;
  }

  let resolved: URL;
  try {
    resolved = new URL(value, "http://cc.invalid");
  } catch {
    return NEXT_FALLBACK;
  }

  if (resolved.origin !== "http://cc.invalid") {
    return NEXT_FALLBACK;
  }

  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  return path.startsWith("/") && !path.startsWith("//") ? path : NEXT_FALLBACK;
}

async function login(formData: FormData): Promise<void> {
  "use server";

  const next = safeNextPath(formData.get("next"));
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!username || !password || !isAllowedLoginUsername(username)) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  
  const result = await callOrdersApi<LoginResponseBody>({
    method: "POST",
    path: "/internal/auth/verify-credentials",
    body: { username, password },
  });


  // Same generic error whether the credentials were wrong or they belong to a non-staff
  // account -- doesn't hint at which, so a customer account can't be used to probe for staff
  // usernames.


 if (result.status !== 200 || result.body.role !== "staff") {
  redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
 }

  const store = await cookies();
  store.set(
    SESSION_COOKIE_NAME,
    createSessionCookieValue({
      userId: result.body.userId,
      username: result.body.username,
      role: result.body.role,
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    },
  );

  redirect(next);
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { error, next } = await searchParams;

  return (
    <>
      <h1>You&apos;re not signed in</h1>
      <p className="muted">Sign in with your staff account to see the order queue.</p>
      {error && <p className="error">Invalid username or password.</p>}
      <form action={login}>
        <input type="hidden" name="next" value={safeNextPath(next)} />
        <label>
          Username
          <input type="text" name="username" required autoComplete="username" />
        </label>
        <label>
          Password
          <input type="password" name="password" required autoComplete="current-password" />
        </label>
        <button type="submit">Sign in</button>
      </form>
    </>
  );
}
