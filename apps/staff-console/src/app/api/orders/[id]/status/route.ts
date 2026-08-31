import { NextResponse } from "next/server";
import { orderStatusUpdateInputSchema } from "@crimson-copies/shared";
import { callOrdersApi } from "../../../../../lib/internal-api";
import { getStaffSession } from "../../../../../lib/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * BFF for `PATCH /api/orders/:id/status` ("advance an order through its lifecycle"). The
 * queue/detail pages already redirect an unauthenticated caller to /login before they can even
 * reach this form, but this route is independently reachable by anyone who can guess the URL --
 * it re-checks the session itself rather than trusting the page to have gated it.
 */
export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  console.log("PATCH /api/orders/:id/status: request received");

  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => undefined);
  const parsed = orderStatusUpdateInputSchema.safeParse(json);
  if (!parsed.success) {
    console.error("PATCH /api/orders/:id/status: validation failed", parsed.error.issues);
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  const result = await callOrdersApi({
    method: "PATCH",
    path: `/api/orders/${id}/status`,
    role: session.role,
    userId: String(session.userId),
    body: parsed.data,
  });

  console.log("PATCH /api/orders/:id/status: request completed", { orderId: id, status: result.status });
  return NextResponse.json(result.body, { status: result.status });
}
