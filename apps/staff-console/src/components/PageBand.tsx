import type { ReactNode } from 'react';

interface PageBandProps {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  /** Line the text up with the full-width board instead of main's column. */
  wide?: boolean;
}

/** Crimson page header -- same band as the storefront's working pages. */
export function PageBand({ eyebrow, title, lead, actions, wide }: PageBandProps) {
  return (
    <section className={wide ? 'page-band page-band--wide' : 'page-band'}>
      <div>
        <p className="page-band-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {lead && <div className="page-band-lead">{lead}</div>}
      </div>
      {actions && <div className="page-band-actions">{actions}</div>}
    </section>
  );
}
