import Link from "next/link";
import { Suspense } from "react";

import { OrderStatusBadge } from "@/components/order/order-status-badge";
import { formatMoney } from "@/lib/money";
import { nowMs } from "@/lib/time";
import { BusinessNotFoundError } from "@/server/business/errors";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { requireSession } from "@/server/auth/session";
import { DASHBOARD_RECENT_ORDERS_LIMIT, getDashboardSummary } from "@/server/order/order-service";

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
      <div className="mx-auto max-w-lg rounded-lg border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">No access</h2>
        <p className="mt-2 text-sm text-muted">You are not a member of this business.</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
        >
          Back to your businesses
        </Link>
      </div>
    );
  }

  const business = authorized.business;
  const ordersHref = `/dashboard/${businessId}/orders`;

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent
        userId={session.user.id}
        businessId={businessId}
        currency={business.currency}
        ordersHref={ordersHref}
      />
    </Suspense>
  );
}

async function DashboardContent({
  userId,
  businessId,
  currency,
  ordersHref,
}: {
  userId: string;
  businessId: string;
  currency: string;
  ordersHref: string;
}) {
  const summary = await getDashboardSummary(userId, businessId, new Date(nowMs()));
  const stats = [
    { label: "Pending", value: summary.pending, dot: "bg-status-warning-fg" },
    { label: "In progress", value: summary.inProgress, dot: "bg-status-info-fg" },
    { label: "Delivered", value: summary.delivered, dot: "bg-status-positive-fg" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Today&apos;s orders
          </h2>
          <p className="mt-1 text-sm text-muted">
            Orders created on {summary.dayStart.toLocaleDateString()} ({summary.timeZone}).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`${ordersHref}/new`}
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-white transition-colors hover:bg-ink"
          >
            New order
          </Link>
          <Link
            href={ordersHref}
            className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-raised"
          >
            All orders
          </Link>
        </div>
      </header>

      <section aria-labelledby="today-summary-heading">
        <h3 id="today-summary-heading" className="sr-only">
          Today&apos;s order summary
        </h3>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-surface p-4 last:col-span-2 sm:p-5 sm:last:col-span-1">
              <dt className="flex items-center gap-2 text-xs font-medium text-muted sm:text-sm">
                <span className={`h-1.5 w-1.5 rounded-full ${stat.dot}`} aria-hidden="true" />
                {stat.label}
              </dt>
              <dd className="mt-2 text-3xl font-semibold tracking-tight text-ink tabular-nums">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="recent-orders-heading" className="flex flex-col gap-4">
        <div>
          <h3 id="recent-orders-heading" className="text-lg font-semibold tracking-tight text-ink">
            Recent orders
          </h3>
          <p className="mt-1 text-sm text-muted">
            The latest {DASHBOARD_RECENT_ORDERS_LIMIT} orders.
          </p>
        </div>

        {summary.recentOrders.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div>
              <p className="text-sm font-medium text-ink">No orders yet</p>
              <p className="mt-1 text-sm text-muted">
                Create an order to start tracking it here.
              </p>
            </div>
            <Link
              href={`${ordersHref}/new`}
              className="mt-4 inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised sm:mt-0"
            >
              Create order
            </Link>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-lg border border-line bg-surface md:block">
              <table className="min-w-full divide-y divide-line text-sm">
                <caption className="sr-only">Recent orders</caption>
                <thead>
                  <tr>
                    <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-muted">
                      Order
                    </th>
                    <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-muted">
                      Customer
                    </th>
                    <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-muted">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-3 text-right text-xs font-medium text-muted">
                      Total
                    </th>
                    <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-muted">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {summary.recentOrders.map((order) => (
                    <tr key={order.id} className="transition-colors hover:bg-raised">
                      <td className="whitespace-nowrap px-5 py-4">
                        <Link
                          href={`${ordersHref}/${order.id}`}
                          className="font-mono text-[13px] font-medium text-ink underline underline-offset-2"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="max-w-[18rem] truncate px-5 py-4 text-ink">
                        {order.customerName}
                      </td>
                      <td className="px-5 py-4">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-medium text-ink tabular-nums">
                        {formatMoney(currency, order.total)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-muted">
                        {order.createdAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface md:hidden">
              {summary.recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`${ordersHref}/${order.id}`}
                    className="flex min-h-16 flex-col gap-2 px-4 py-3 transition-colors hover:bg-raised"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-mono text-[13px] font-medium text-ink">
                        {order.orderNumber}
                      </span>
                      <span className="shrink-0 text-sm font-medium text-ink tabular-nums">
                        {formatMoney(currency, order.total)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <span className="min-w-0 truncate text-ink">{order.customerName}</span>
                      <span aria-hidden="true">·</span>
                      <OrderStatusBadge status={order.status} />
                      <span aria-hidden="true">·</span>
                      <span>{order.createdAt.toLocaleDateString()}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function DashboardLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <span role="status" className="sr-only">
        Loading dashboard
      </span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded bg-raised" />
          <div className="h-4 w-72 rounded bg-raised" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-28 rounded bg-raised" />
          <div className="h-10 w-28 rounded bg-raised" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="bg-surface p-4 last:col-span-2 sm:p-5 sm:last:col-span-1"
          >
            <div className="h-4 w-24 rounded bg-raised" />
            <div className="mt-3 h-8 w-16 rounded bg-raised" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="h-5 w-40 rounded bg-raised" />
        <div className="mt-4 space-y-px">
          <div className="h-10 rounded bg-raised" />
          <div className="h-10 rounded bg-raised" />
          <div className="h-10 rounded bg-raised" />
        </div>
      </div>
    </div>
  );
}
