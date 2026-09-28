export function isAllowedAuthEmail(email?: string): boolean {
  if (!email) return false;

  const normalized = email.trim().toLowerCase();

  return (
    normalized === 'customer' ||
    normalized === 'staff' ||
    normalized.endsWith('@crimson.ua.edu') ||
    normalized.endsWith('@ua.edu')
  );
}

export function getSessionEmail(
  session: {
    user?: {
      email?: string | null;
      name?: string | null;
      nickname?: string | null;
    };
  },
): string | undefined {
  const candidates = [
    session?.user?.email,
    session?.user?.name,
    session?.user?.nickname,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return undefined;
}

export function isUnverifiedEmailSession(
  session?: { user?: { email_verified?: boolean } } | null,
): boolean {
  return !!session && session.user?.email_verified === false;
}