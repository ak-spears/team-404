import type { Order } from '@crimson-copies/shared';
import { OrderRow } from './OrderRow';
import { ORDER_VIEWS, searchOrders, type OrderView } from '../lib/orders';

/** Build an `/orders` URL that keeps whichever of view/search the caller isn't changing. */
export function ordersHref({ view, q }: { view?: OrderView; q?: string }): string {
  const params = new URLSearchParams();
  if (view && view !== 'all') params.set('view', view);
  if (q) params.set('q', q);
  const query = params.toString();
  return query ? `/orders?${query}` : '/orders';
}

/**
 * The search box, filter tabs and result list for "My orders".
 *
 * Split out from the page so it renders from a plain `orders` array: the page owns fetching
 * and auth, this owns everything the customer actually interacts with.
 */
export function OrdersBrowser({
  orders,
  view,
  query,
}: {
  orders: Order[];
  view: OrderView;
  query: string;
}) {
  // Search first, then the tab filter -- so the tab counts report how many results the
  // search found in each bucket rather than how many orders exist overall. A tab whose
  // count is 0 under the current search is still clickable; it lands on the "no match"
  // state below, which is the one that offers a way out of the search.
  const matched = searchOrders(orders, query);
  const shown = matched.filter(ORDER_VIEWS[view].match);

  return (
    <>
      {orders.length > 0 && (
        <>
          <OrderSearch view={view} query={query} />
          <OrderTabs orders={matched} current={view} query={query} />
        </>
      )}
      {shown.length > 0 ? (
        <>
          {query && (
            <p className="order-result-count" role="status">
              {shown.length === 1 ? '1 order matches' : `${shown.length} orders match`} &ldquo;
              {query}&rdquo;
            </p>
          )}
          <ul className="order-list">
            {shown.map((order) => (
              <li key={order.id}>
                <OrderRow order={order} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState view={view} query={query} />
      )}
    </>
  );
}

/**
 * A plain GET form, so search works with client JS off -- same reasoning as the tabs. The
 * current tab rides along in a hidden field, so searching inside "Ready for pickup" keeps
 * you there instead of bouncing to "All".
 */
function OrderSearch({ view, query }: { view: OrderView; query: string }) {
  return (
    <form className="order-search" role="search" action="/orders" method="get">
      {view !== 'all' && <input type="hidden" name="view" value={view} />}
      <label htmlFor="order-search-input" className="sr-only">
        Search your orders
      </label>
      <input
        id="order-search-input"
        type="search"
        name="q"
        defaultValue={query}
        placeholder="Search by number, service, status, or notes"
        autoComplete="off"
        maxLength={100}
      />
      <button type="submit">Search</button>
      {query && (
        <a className="order-search-clear" href={ordersHref({ view })}>
          Clear
        </a>
      )}
    </form>
  );
}

/** Filter tabs as plain links (`?view=`), so filtering works without client JS. */
function OrderTabs({
  orders,
  current,
  query,
}: {
  orders: Order[];
  current: OrderView;
  query: string;
}) {
  const views = Object.keys(ORDER_VIEWS) as OrderView[];
  return (
    <nav className="order-tabs" aria-label="Filter orders">
      {views.map((view) => (
        <a
          key={view}
          href={ordersHref({ view, q: query })}
          aria-current={view === current ? 'page' : undefined}
        >
          {ORDER_VIEWS[view].label}
          <span className="order-tabs-count">{orders.filter(ORDER_VIEWS[view].match).length}</span>
        </a>
      ))}
    </nav>
  );
}

/**
 * Three different dead ends, three different ways out: no orders at all (go place one), a
 * search that matched nothing (drop the search), or an empty tab (go back to All).
 */
function EmptyState({ view, query }: { view: OrderView; query: string }) {
  if (query) {
    return (
      <div className="order-empty">
        <p>
          No orders match &ldquo;{query}&rdquo;
          {view === 'all' ? '.' : ` in ${ORDER_VIEWS[view].label}.`}
        </p>
        {view === 'all' ? (
          <a href="/orders">Clear search &rarr;</a>
        ) : (
          <a href={ordersHref({ q: query })}>Search all orders &rarr;</a>
        )}
      </div>
    );
  }
  return (
    <div className="order-empty">
      <p>{ORDER_VIEWS[view].empty}</p>
      {view === 'all' ? (
        <a href="/order">Start your first order &rarr;</a>
      ) : (
        <a href="/orders">See all orders &rarr;</a>
      )}
    </div>
  );
}
