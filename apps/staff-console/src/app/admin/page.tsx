import { redirect } from 'next/navigation';
import Link from 'next/link';
import { BASE_PATH } from '../../lib/base-path';
import { getStaffSession, hasAdminSession } from '../../lib/session';

export default async function AdminPage() {
  const session = await getStaffSession();
  if (!session) redirect('/login?next=/admin');

  if (!(await hasAdminSession())) {
    return (
      <section className="admin-confirmation">
        <p className="admin-eyebrow">Crimson Copies · Administration</p>
        <h1>Are you an admin?</h1>
        <form action={`${BASE_PATH}/api/admin/login`} method="post">
          <button type="submit">Yes, continue</button>
        </form>
        <p className="admin-demo-note" role="note">
          Demo purposes only: this confirmation is not real admin authentication. Replace it with
          dedicated admin roles before production.
        </p>
      </section>
    );
  }

  return (
    <>
      <header className="admin-masthead">
        <p className="admin-eyebrow">Crimson Copies · Administration</p>
        <h1>Admin home</h1>
        <p>Choose an area to manage the print shop.</p>
      </header>
      <p className="admin-demo-note" role="note">
        Demo access only. The current admin confirmation is not a real authorization system.
      </p>
      <nav className="admin-dashboard" aria-label="Admin tools">
        <Link className="admin-dashboard-option" href="/admin/assignments">
          <span className="admin-option-number">01</span>
          <span className="admin-option-title">Order assignments</span>
          <span className="admin-option-description">
            Assign incoming orders to staff and review current workloads.
          </span>
          <span className="admin-option-action">
            Open assignments <span aria-hidden="true">→</span>
          </span>
        </Link>
        <Link className="admin-dashboard-option" href="/admin/analytics">
          <span className="admin-option-number">02</span>
          <span className="admin-option-title">Shop insights</span>
          <span className="admin-option-description">
            Review weekly order volume, recorded sales, and popular services.
          </span>
          <span className="admin-option-action">
            View insights <span aria-hidden="true">→</span>
          </span>
        </Link>
        <Link className="admin-dashboard-option" href="/admin/staff">
          <span className="admin-option-number">03</span>
          <span className="admin-option-title">Staff access</span>
          <span className="admin-option-description">
            Register UA emails for access through Google sign-in.
          </span>
          <span className="admin-option-action">
            Manage staff <span aria-hidden="true">→</span>
          </span>
        </Link>
      </nav>
    </>
  );
}
