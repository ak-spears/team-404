import type { Order } from '@crimson-copies/shared';
import { sortOrders, summarizeOrders } from '../lib/orders';
import { OrderRow } from './OrderRow';
import { PhotoCredit } from './PhotoCredit';
import { ScrollDock } from './ScrollDock';
import { ServicesSection } from './ServicesSection';

const RECENT_LIMIT = 5;

interface CustomerHomeProps {
  name: string;
  orders: Order[];
}

export function CustomerHome({ name, orders }: CustomerHomeProps) {
  const recent = sortOrders(orders).slice(0, RECENT_LIMIT);

  return (
    <>
      {/* Same scroll effect as the public home: the band closes into the header and its
          buttons fly into the matching nav links. */}
      <section className="welcome welcome--photo" data-dock-until>
        <ScrollDock />
        <p className="welcome-eyebrow">Your print desk</p>
        <h1>Welcome back, {name}</h1>
        <p className="welcome-summary">{summarizeOrders(orders)}</p>
        <div className="welcome-actions">
          <a href="/order" className="btn-primary" data-dock="order">
            <span data-dock-label>Place an order</span>
          </a>
          <a href="/orders" className="btn-ghost" data-dock="orders">
            <span data-dock-label>All orders</span>
          </a>
        </div>
      </section>

      <section className="dash-section">
        <div className="section-head">
          <h2>Recent orders</h2>
          {orders.length > RECENT_LIMIT && (
            <a href="/orders" className="section-link">
              View all {orders.length} &rarr;
            </a>
          )}
        </div>
        {recent.length > 0 ? (
          <ul className="order-list">
            {recent.map((order) => (
              <li key={order.id}>
                <OrderRow order={order} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="order-empty">
            <p>Your orders will show up here, with where each one is in the queue.</p>
            <a href="/order">Start your first order &rarr;</a>
          </div>
        )}
      </section>

      <ServicesSection
        title="Order something new"
        lead="Upload your files with the order — no more emailing them back and forth."
        signedIn
      />

      <PhotoCredit
        subject="Hewson Hall, The University of Alabama (Robert A.M. Stern Architects)"
        source="https://www.ramsa.com/sites/default/files/styles/2000x800/public/Website%20Banners_Page_271.jpg?itok=4vwcvzaG"
      />
    </>
  );
}
