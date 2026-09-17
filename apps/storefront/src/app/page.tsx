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

/** Public catalog/pricing view. No auth required to browse. */
export default function CatalogPage() {
  return (
    <>
      <section className="masthead">
        <h1 className="masthead-title">Crimson Copies</h1>
        <p className="masthead-tagline">Order printing, posters, and copies -- no email required.</p>
      </section>
      <section className="intro">
        <h2>Service catalog</h2>
        <p>
          Submit an order online -- no more emailing files back and forth.{' '}
          <a href="/order">Place an order</a>, no account required.
        </p>
        <a href="/order" className="btn-primary">
          Place an order
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
