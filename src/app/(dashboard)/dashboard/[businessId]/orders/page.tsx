import Link from "next/link";

import { getAuthorizedBusiness } from "@/server/business/queries";
import { BusinessNotFoundError } from "@/server/business/errors";
import { listOrders } from "@/server/order/order-service";
import { requireSession } from "@/server/auth/session";

// M5 Orders list (MASTER_SPEC.md roadmap: "Orders: Create, View, Edit,
// Calculate totals, Payment status, Delivery information"). Access is
// resolved server-side: the session user must be a member of the business in
// the URL, so a businessId in a browser tab is only ever a lookup identifier.
//
// Both OWNER and STAFF may view and create orders (MASTER_SPEC.md §4), so the
// "New order" control is shown to every member. Deliberately without
// search/filter: MASTER_SPEC defers those to the dashboard milestone.

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const session = await requireSession();

  let isMember = false;
  try {
    await getAuthorizedBusiness(session.user.id, businessId);
    isMember = true;
  } catch (error) {
    if (error instanceof BusinessNotFoundError) {
      return (
        <div className="max-w-lg rounded-md border border-neutral-200 bg-white p-6">
          <h2 className="text-base font-semibold text-neutral-900">No access</h2>
          <p className="mt-2 text-sm text-neutral-600">
            You are not a member of this business.
          </p>
        </div>
      );
    }

    throw error;
  }

  // Membership was already verified above; listOrders re-checks it inside the
  // service so every entry point resolves authorization the same way.
  const orders = isMember
    ? await listOrders(session.user.id, businessId)
    : [];
  const listHref = `/dashboard/${businessId}/orders`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Orders</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Orders this business has taken, newest first.
          </p>
        </div>
        <Link
          href={`${listHref}/new`}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          New order
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-white p-6">
          <p className="text-sm text-neutral-600">No orders yet.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Create the first order once at least one product exists.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead>
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium text-neutral-500">
                  Order
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-neutral-500">
                  Customer
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-neutral-500">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-neutral-500">
                  Payment
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-neutral-500">
                  Total
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-neutral-500">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    <Link
                      href={`${listHref}/${order.id}`}
                      className="hover:underline underline-offset-2"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{order.customerName}</td>
                  <td className="px-4 py-3 text-neutral-700">{order.status}</td>
                  <td className="px-4 py-3 text-neutral-700">{order.paymentStatus}</td>
                  <td className="px-4 py-3 text-neutral-900">{order.total}</td>
                  <td className="px-4 py-3 text-neutral-500">
                    {order.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
