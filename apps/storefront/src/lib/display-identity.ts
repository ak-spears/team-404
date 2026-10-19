import { auth0 } from './auth0';
import { getSession } from './session';

export interface DisplayIdentity {
  /** Friendly first name for greetings and the account button. */
  name: string;
  /** Full name when the identity provider has one, for prefilling contact forms. */
  fullName: string | null;
  /** Full sign-in identifier (email, or the local dev username). */
  email: string;
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Who's signed in, for display only (never for authorization). Null when signed out. */
export async function getDisplayIdentity(): Promise<DisplayIdentity | null> {
  const user = (await auth0.getSession())?.user;
  const localSession = await getSession();
  const email = user?.email ?? user?.nickname ?? localSession?.username;
  if (!email) return null;

  const fullName = typeof user?.name === 'string' && !user.name.includes('@') ? user.name : null;
  const raw = user?.given_name ?? fullName ?? email.split('@')[0];
  return { name: capitalize(String(raw).split(/[\s._-]/)[0] ?? email), fullName, email };
}
