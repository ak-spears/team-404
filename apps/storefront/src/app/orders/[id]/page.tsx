import { notFound } from 'next/navigation';
import type { Order } from '@crimson-copies/shared';
import { OrderFileUpload, type UploadNotice } from '../../../components/OrderFileUpload';
import { getFileCaller, isPositiveIntegerId } from '../../../lib/file-access';
import { callOrdersApi } from '../../../lib/internal-api';
import { filesLoadErrorMessage, uploadErrorMessage } from '../../../lib/order-files';
import { listOrderFiles } from '../../../lib/order-files-server';

// Order status and files change underneath this page (staff updates, uploads), so it is
// rendered fresh on every request -- never served from a cache.
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ uploaded?: string | string[]; uploadError?: string | string[] }>;
}

/**
 * Checkout redirects here with the outcome of its upload: `?uploaded=<name>` or
 * `?uploadError=<status>`. Both are display-only (React escapes the name) and are mapped
 * through the same fixed messages the upload card uses.
 */
function checkoutNotice(params: Awaited<PageProps['searchParams']>): UploadNotice | undefined {
  const uploaded = typeof params.uploaded === 'string' ? params.uploaded.slice(0, 200) : undefined;
  if (uploaded) return { kind: 'success', text: uploaded };
  const status = typeof params.uploadError === 'string' ? Number(params.uploadError) : NaN;
  if (Number.isInteger(status)) {
    return {
      kind: 'error',
      text: `Your order was placed, but the file didn't upload: ${uploadErrorMessage(status)} Add it below -- the order itself is fine.`,
    };
  }
  return undefined;
}

/**
 * Order-status page, reachable by direct link (the URL customers get in their confirmation
 * email). Loads the order AND its files from orders-api on every render, so refreshing after an
 * upload keeps the customer here with an accurate list. A signed-in customer viewing someone
 * else's order id still gets a 403 from orders-api (see routes/orders.ts).
 */
export default async function OrderStatusPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  if (!isPositiveIntegerId(id)) notFound();

  const caller = await getFileCaller();
  const result = await callOrdersApi<Order>({
    method: 'GET',
    path: `/api/orders/${id}`,
    role: caller.role,
    userId: caller.userId,
  });

  if (result.status === 404) notFound();
  if (result.status === 403) {
    return (
      <>
        <h1>Order #{id}</h1>
        <p className="error">
          This order isn&apos;t associated with your account, or your account isn&apos;t linked
          yet. Contact staff if you believe this is an error.
        </p>
      </>
    );
  }
  if (result.status !== 200) notFound();

  const order = result.body;
  const files = await listOrderFiles(order.id, caller);

  return (
    <>
      <h1>Order #{order.id}</h1>
      <dl>
        <dt>Service</dt>
        <dd>{order.serviceType}</dd>
        <dt>Status</dt>
        <dd>
          <span className="badge" data-status={order.status}>
            {order.status}
          </span>
        </dd>
        <dt>Quantity</dt>
        <dd>{order.quantity}</dd>
        <dt>Submitted</dt>
        <dd>{new Date(order.createdAt).toLocaleString()}</dd>
      </dl>
      <OrderFileUpload
        orderId={order.id}
        initialFiles={files.ok ? files.files : null}
        initialLoadError={files.ok ? null : filesLoadErrorMessage(files.status)}
        initialNotice={checkoutNotice(await searchParams)}
      />
    </>
  );
}
