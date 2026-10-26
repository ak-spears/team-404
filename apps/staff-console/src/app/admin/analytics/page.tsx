import Link from 'next/link';
import type { Order, ServiceType } from '@crimson-copies/shared';
import { callOrdersApi } from '../../../lib/internal-api';
import { requireAdminSession } from '../../../lib/admin-session';
import { SERVICE_TITLES } from '../../../lib/labels';

export const dynamic = 'force-dynamic';

function startOfWeek(date: Date): Date {
  const week = new Date(date);
  week.setUTCHours(0, 0, 0, 0);
  week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
  return week;
}

function currency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default async function AdminAnalyticsPage() {
  const session = await requireAdminSession();
  const result = await callOrdersApi<Order[]>({
    method: 'GET',
    path: '/api/orders',
    role: session.role,
    userId: String(session.userId),
  });
  const orders = Array.isArray(result.body) ? result.body : [];

  const currentWeek = startOfWeek(new Date());
  const weeks = Array.from({ length: 8 }, (_, index) => {
    const weekStart = new Date(currentWeek);
    weekStart.setUTCDate(currentWeek.getUTCDate() - (7 - index) * 7);
    return { weekStart, orderCount: 0, salesCents: 0 };
  });

  const services = new Map<string, { orders: number; quantity: number; salesCents: number }>();
  for (const order of orders) {
    const orderWeek = startOfWeek(new Date(order.createdAt)).getTime();
    const week = weeks.find((item) => item.weekStart.getTime() === orderWeek);
    if (week) {
      week.orderCount += 1;
      if (order.status !== 'cancelled') week.salesCents += order.priceCents ?? 0;
    }

    const service = services.get(order.serviceType) ?? { orders: 0, quantity: 0, salesCents: 0 };
    service.orders += 1;
    service.quantity += order.quantity;
    if (order.status !== 'cancelled') service.salesCents += order.priceCents ?? 0;
    services.set(order.serviceType, service);
  }

  const totalSales = orders.reduce(
    (sum, order) => sum + (order.status === 'cancelled' ? 0 : (order.priceCents ?? 0)),
    0,
  );
  const topServices = [...services.entries()].sort((a, b) => b[1].quantity - a[1].quantity);
  const maxOrders = Math.max(1, ...weeks.map((week) => week.orderCount));

  return (
    <>
      <Link className="admin-back-link" href="/admin">
        ← Admin home
      </Link>
      <h1>Shop Insights</h1>
      <p className="admin-analytics-note">
        Sales are estimated from recorded order prices and exclude cancelled orders. Quoted jobs
        without a price are not included in sales totals.
      </p>
      <section className="admin-metrics" aria-label="Shop overview">
        <article className="admin-metric">
          <span>All-Time Orders</span>
          <strong>{orders.length}</strong>
        </article>
        <article className="admin-metric">
          <span>Recorded Sales</span>
          <strong>{currency(totalSales)}</strong>
        </article>
        <article className="admin-metric">
          <span>Unassigned Orders</span>
          <strong>
            {orders.filter((order) => !order.assignedTo && order.status !== 'cancelled').length}
          </strong>
        </article>
      </section>
      <section className="admin-analytics-section">
        <h2>Orders by Week</h2>
        <div
          className="weekly-chart"
          role="list"
          aria-label="Weekly order counts for the last eight weeks"
        >
          {weeks.map((week) => (
            <div className="weekly-chart-column" role="listitem" key={week.weekStart.toISOString()}>
              <span className="weekly-chart-value">{week.orderCount}</span>
              <div className="weekly-chart-track">
                <div
                  className="weekly-chart-bar"
                  style={{
                    height: `${Math.max(week.orderCount ? 8 : 2, (week.orderCount / maxOrders) * 100)}%`,
                  }}
                />
              </div>
              <span className="weekly-chart-label">
                {week.weekStart.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                })}
              </span>
              <span className="weekly-chart-sales">{currency(week.salesCents)}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="admin-analytics-section">
        <h2>Most Ordered Services</h2>
        {topServices.length === 0 ? (
          <p className="muted">No order data yet.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Orders</th>
                  <th>Items / Quantity</th>
                  <th>Recorded Sales</th>
                </tr>
              </thead>
              <tbody>
                {topServices.map(([type, stats]) => (
                  <tr key={type}>
                    <td>{SERVICE_TITLES[type as ServiceType] ?? type}</td>
                    <td>{stats.orders}</td>
                    <td>{stats.quantity}</td>
                    <td>{currency(stats.salesCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
