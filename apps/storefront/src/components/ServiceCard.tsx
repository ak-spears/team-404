interface ServiceCardProps {
  title: string;
  blurb: string;
  price: string;
  unit: string;
  href: string;
  cta: string;
  featured?: boolean;
}

/** One price-list entry, rendered as a fully clickable card. `featured` spans the whole grid row. */
export function ServiceCard({ title, blurb, price, unit, href, cta, featured }: ServiceCardProps) {
  return (
    <a href={href} className={featured ? 'service-card service-card--featured' : 'service-card'}>
      <div className="service-head">
        <h3>{title}</h3>
        <p className="service-price">
          <strong>{price}</strong> <span>{unit}</span>
        </p>
      </div>
      <p className="service-blurb">{blurb}</p>
      <span className="service-cta">
        {cta} <span aria-hidden>&rarr;</span>
      </span>
    </a>
  );
}
