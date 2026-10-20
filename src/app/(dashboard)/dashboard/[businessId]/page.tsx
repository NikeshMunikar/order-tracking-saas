import Link from "next/link";

import { DASHBOARD_RECENT_ORDERS_LIMIT, getDashboardSummary } from "@/server/order/order-service";
import { BusinessNotFoundError } from "@/server/business/errors";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { requireSession } from "@/server/auth/session";
import { formatMoney } from "@/lib/money";
import { orderStatusLabel } from "@/lib/order-status";
import { nowMs } from "@/lib/time";

/**
 * Per-business dashboard (MASTER_SPEC.md §17 / milestone 8).
 *
 * Shows "Today's Orders" — orders CREATED during the business's LOCAL calendar
 * day (from `Business.timezone`, UTC fallback) grouped as Pending / In Progress
 * / Delivered (DEC-014 D1/D2) — plus a short recent-orders list. Kept basic:
 * no charts, no reporting (§17), and usable on mobile (§34).
 *
 * Authorization: the caller's membership for the URL's `businessId` is
 * re-resolved server-side; the URL segment is only a navigation identifier. A
 * non-member gets the same generic "no access" response as everywhere else.
 * OWNER and STAFF both land here (both may view orders per §4).
 */
export default async function BusinessDashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const session = await requireSession();
  const { businessId } = await params;

  const authorized = await getAuthorizedBusiness(session.user.id, businessId).catch(
    (error: unknown) => {
      if (!(error instanceof BusinessNotFoundError)) throw error;
      return null;
    },
  );

  if (!authorized) {
    return (
      <div className="mx-auto max-w-lg">
        <h2 className="text-base font-semibold text-neutral-900">No access</h2>
        <p className="mt-2 text-sm text-neutral-500">
          You are not a member of this business.
        </p>
      </div>
    );
  }

  const business = authorized.business;
  const ordersHref = `/dashboard/${businessId}/orders`;
  const summary = await getDashboardSummary(session.user.id, businessId, new Date(nowMs()));

  const stats = [
    { label: "Pending", value: summary.pending },
    { label: "In Progress", value: summary.inProgress },
    { label: "Delivered", value: summary.delivered },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Today&apos;s Orders</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Orders created on {summary.dayStart.toLocaleDateString()} ({summary.timeZone}).
          </p>
        </div>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-md border border-neutral-200 bg-white p-4"
            >
              <dt className="text-sm text-neutral-500">{stat.label}</dt>
              <dd className="mt-1 text-2xl font-semibold text-neutral-900">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Recent orders</h2>
            <p className="mt-1 text-sm text-neutral-500">
              The latest {DASHBOARD_RECENT_ORDERS_LIMIT} orders.
            </p>
          </div>
          <Link
            href={ordersHref}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            All orders
          </Link>
        </div>

        {summary.recentOrders.length === 0 ? (
          <p className="text-sm text-neutral-500">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <caption className="sr-only">Recent orders</caption>
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-neutral-500">Order</th>
                  <th className="px-4 py-3 text-left font-medium text-neutral-500">Customer</th>
                  <th className="px-4 py-3 text-left font-medium text-neutral-500">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-neutral-500">Total</th>
                  <th className="px-4 py-3 text-left font-medium text-neutral-500">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {summary.recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`${ordersHref}/${order.id}`}
                        className="font-medium text-neutral-900 underline underline-offset-2"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{order.customerName}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      {orderStatusLabel(order.status)}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {formatMoney(business.currency, order.total)}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {order.createdAt.toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
