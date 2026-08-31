import { NextResponse } from "next/server";
import { callOrdersApi } from "../../../../lib/internal-api";
import { getSession } from "../../../../lib/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** BFF for `GET /api/orders/:id` -- the storefront's order-status page. */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  console.log("GET /api/orders/:id: request received");

  const { id } = await params;
  const session = await getSession();
  const result = await callOrdersApi({
    method: "GET",
    path: `/api/orders/${id}`,
    role: session?.role,
    userId: session ? String(session.userId) : undefined,
  });

  console.log("GET /api/orders/:id: request completed", { orderId: id, status: result.status });
  return NextResponse.json(result.body, { status: result.status });
}
