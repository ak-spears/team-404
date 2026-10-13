const DEFAULT_STAFF_CONSOLE_ORIGIN =
  process.env.NODE_ENV === 'production'
    ? 'https://team-404.capstone.uamishub.com'
    : 'http://localhost:3001';

export function getStaffConsoleUrl(path: string): URL {
  const configuredOrigin = process.env.STAFF_CONSOLE_ORIGIN ?? DEFAULT_STAFF_CONSOLE_ORIGIN;
  const origin = new URL(configuredOrigin);
  return new URL(path, origin);
}
