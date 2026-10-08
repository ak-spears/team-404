import { callOrdersApi } from './internal-api';
import { auth0 } from './auth0';
import { getSession } from './session';

/**
 * Resolves the caller's orders-api identity from either a local session or an Auth0 session.
 * Moved unchanged from app/api/orders/route.ts so the order page and file routes identify the
 * caller the same way order creation does. Server-only.
 */
export async function getAuthenticatedUser() {
  const localSession = await getSession();

  if (localSession) {
    return {
      userId: String(localSession.userId),
      role: localSession.role,
    };
  }

  const authSession = await auth0.getSession();
  const email = authSession?.user?.email;

  if (!email) {
    return {
      userId: undefined,
      role: undefined,
    };
  }

  const result = await callOrdersApi<{
    userId: number;
    username: string;
    role: 'customer' | 'staff';
  }>({
    method: 'POST',
    path: '/internal/auth/verify-auth0-email',
    body: { email },
  });

  if (result.status !== 200) {
    console.error('Auth0 user verification failed:', result);
    return {
      userId: undefined,
      role: undefined,
    };
  }

  return {
    userId: String(result.body.userId),
    role: result.body.role,
  };
}
