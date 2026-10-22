import { redirect } from 'next/navigation';
import { getStaffSession, hasAdminSession } from './session';

export async function requireAdminSession() {
  const session = await getStaffSession();
  if (!session) redirect('/login?next=/admin');
  if (!(await hasAdminSession())) redirect('/admin');
  return session;
}
