import { cookies } from 'next/headers';
import { PRICING_TABLE_CENTS, SERVICE_TYPES, type ServiceType } from '@crimson-copies/shared';

// department_job's label was slotted in at the top when the quoted-pricing case landed --
// the rest are still in their original order.
const SERVICE_LABELS: Record<ServiceType, string> = {
  department_job: 'Department job (quoted)',
  poster: 'Poster printing',
  resume_portfolio: 'Resume / portfolio printing',
  class_assignment: 'Class assignment (per page)',
  personal_printing: 'Personal printing (per page)',
};

function formatPrice(cents: number | null): string {
  if (cents === null) return 'Quoted by staff';
  return `$${(cents / 100).toFixed(2)}`;
}

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

function getHomePageErrorMessage(error?: string): string | null {
  if (error === 'ua-email-required') {
    return 'A UA email address is required to sign in.';
  }
  return null;
}

/** Public catalog/pricing view. No auth required to browse. */
export default async function CatalogPage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const { error } = await searchParams;
  const flashError = cookieStore.get('ua_email_error')?.value;
  const homeError = getHomePageErrorMessage(error) || (flashError === 'ua-email-required' ? getHomePageErrorMessage('ua-email-required') : null);

  return (
    <>
      {homeError && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '0.5rem', background: '#fde7e7', color: '#7f1d1d', border: '1px solid #f5b7b1' }}>
          {homeError}
        </div>
      )}
      <section className="masthead">
        <h1 className="masthead-title">Crimson Copies</h1>
        <p className="masthead-tagline">Order printing, posters, and copies -- no email required.</p>
      </section>
      <section className="intro">
        <h2>Service catalog</h2>
        <p>
          Sign in to place an order and manage your print jobs.
        </p>
        <a href="/auth/login" className="btn-primary">
          Sign in to order
        </a>
      </section>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {SERVICE_TYPES.map((serviceType) => (
              <tr key={serviceType}>
                <td>{SERVICE_LABELS[serviceType]}</td>
                <td>{formatPrice(PRICING_TABLE_CENTS[serviceType])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}