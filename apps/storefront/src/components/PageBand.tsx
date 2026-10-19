import type { ReactNode } from 'react';

interface PageBandProps {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  /** Buttons on the crimson band (styled like the customer home's welcome actions). */
  actions?: ReactNode;
}

/** Compact crimson page header -- the customer home's welcome band, sized for working pages. */
export function PageBand({ eyebrow, title, lead, actions }: PageBandProps) {
  return (
    <section className="welcome welcome--compact">
      <div className="welcome-text">
        <p className="welcome-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {lead && <p className="welcome-summary">{lead}</p>}
      </div>
      {actions && <div className="welcome-actions">{actions}</div>}
    </section>
  );
}
