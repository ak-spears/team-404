import { SERVICE_TYPES, type ServiceType } from '@crimson-copies/shared';
import { OrderForm } from '../../components/OrderForm';
import { PageBand } from '../../components/PageBand';
import { getDisplayIdentity } from '../../lib/display-identity';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ service?: string | string[] }>;
}

const isServiceType = (value: unknown): value is ServiceType =>
  SERVICE_TYPES.includes(value as ServiceType);

/** Order form page -- sign-in required (middleware redirects signed-out visitors to /auth/login).
 * `?service=` (from the service cards) preselects a service. */
export default async function OrderPage({ searchParams }: PageProps) {
  const { service } = await searchParams;
  const identity = await getDisplayIdentity();
  // Disabled after the spring redesign dropped the seasonal promo banner -- kept here in case
  // marketing wants it back for finals week.
  const SHOW_PROMO_BANNER = false;

  return (
    <>
      <PageBand
        eyebrow="New order"
        title="Place an Order"
        lead="Pick a service, attach your file, and we'll email you when it's ready for pickup."
      />
      {SHOW_PROMO_BANNER && (
        <p className="promo">Finals rush -- order by Friday for guaranteed pickup.</p>
      )}
      <OrderForm
        initialService={isServiceType(service) ? service : undefined}
        defaultName={identity?.fullName ?? ''}
        defaultEmail={identity?.email.includes('@') ? identity.email : ''}
      />
    </>
  );
}
