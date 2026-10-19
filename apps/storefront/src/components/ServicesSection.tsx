import { PRICING_TABLE_CENTS, SERVICE_TYPES, type ServiceType } from '@crimson-copies/shared';
import { formatPrice, SERVICE_DETAILS } from '../lib/services';
import { ServiceCard } from './ServiceCard';

interface ServicesSectionProps {
  title: string;
  lead: string;
  signedIn: boolean;
  id?: string;
}

/** Services & prices grid shared by the public home page and the customer home. */
export function ServicesSection({ title, lead, signedIn, id }: ServicesSectionProps) {
  // Signed in, each card opens the order form with its service already picked.
  const orderHref = (type: ServiceType) => (signedIn ? `/order?service=${type}` : '/auth/login');
  // Quoted services (no static price) lead with the wide featured card.
  const pricedServices = SERVICE_TYPES.filter((type) => PRICING_TABLE_CENTS[type] !== null);
  const quotedServices = SERVICE_TYPES.filter((type) => PRICING_TABLE_CENTS[type] === null);

  const card = (type: ServiceType, cta: string, featured?: boolean) => {
    const { title, blurb, unit } = SERVICE_DETAILS[type];
    return (
      <ServiceCard
        key={type}
        title={title}
        blurb={blurb}
        unit={unit}
        price={formatPrice(PRICING_TABLE_CENTS[type])}
        href={orderHref(type)}
        cta={cta}
        featured={featured}
      />
    );
  };

  return (
    <section className="services" id={id}>
      <div className="section-head">
        <h2>{title}</h2>
        <p>{lead}</p>
      </div>

      <div className="service-grid">
        {quotedServices.map((type) =>
          card(type, signedIn ? 'Request a quote' : 'Sign in to request', true),
        )}
        {pricedServices.map((type) => card(type, signedIn ? 'Order' : 'Sign in to order'))}
      </div>
    </section>
  );
}
