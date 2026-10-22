import Link from "next/link";

import { OrderPageHeader } from "@/components/order/order-page-header";
import { OrderStatusBadge } from "@/components/order/order-status-badge";
import { PaymentStatusBadge } from "@/components/order/payment-status-badge";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { BusinessNotFoundError } from "@/server/business/errors";
import { listOrders } from "@/server/order/order-service";
import { requireSession } from "@/server/auth/session";
import {
  ORDER_SEARCH_MAX_LENGTH,
  parseOrderListQuery,
} from "@/lib/validation/order";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUSES, orderStatusLabel } from "@/lib/order-status";

// M5 Orders list (MASTER_SPEC.md roadmap: "Orders: Create, View, Edit,
// Calculate totals, Payment status, Delivery information"), extended in M8
// with search, status filter and pagination (§17/§44; decisions D3/D4).
//
// Access is resolved server-side: the session user must be a member of the
// business in the URL, so a businessId in a browser tab is only ever a lookup
// identifier. Both OWNER and STAFF may view and create orders (§4), so the
// "New order" control is shown to every member.
//
// The `q`, `status` and `page` parameters are parsed INDEPENDENTLY (M3 audit
// F3): a malformed value falls back to its default with a visible notice
// without discarding the other valid parameters.

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessId } = await params;
  const rawSearchParams = await searchParams;
  const session = await requireSession();

  const authorized = await getAuthorizedBusiness(session.user.id, businessId).catch(
    (error: unknown) => {
      if (error instanceof BusinessNotFoundError) return null;
      throw error;
    },
  );

  if (!authorized) {
    return (
      <div className="max-w-lg rounded-lg border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">No access</h2>
        <p className="mt-2 text-sm text-muted">You are not a member of this business.</p>
      </div>
    );
  }

  const business = authorized.business;

  const parsed = parseOrderListQuery({
    q: rawSearchParams.q,
    status: rawSearchParams.status,
    page: rawSearchParams.page,
  });
  const query = { q: parsed.q, status: parsed.status, page: parsed.page };
  const listHref = `/dashboard/${businessId}/orders`;

  // Membership was already verified above; listOrders re-checks it inside the
  // service so every entry point resolves authorization the same way.
  const result = await listOrders(session.user.id, businessId, {
    query: query.q,
    status: query.status,
    page: query.page,
  });

  const isSearching = typeof query.q === "string" && query.q.length > 0;
  const isFiltering = query.status !== undefined;
  const hasNotices = Boolean(parsed.searchError || parsed.statusError || parsed.pageError);
  const isFiltered = isSearching || isFiltering;

  // Preserve the active search/filter and only emit `page` when it is not the
  // first page, so the canonical list URL stays clean.
  const pageHref = (page: number) => {
    const next = new URLSearchParams();
    if (isSearching && query.q) next.set("q", query.q);
    if (isFiltering && query.status) next.set("status", query.status);
    if (page > 1) next.set("page", String(page));

    const queryString = next.toString();
    return queryString === "" ? listHref : `${listHref}?${queryString}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <OrderPageHeader
        backHref={`/dashboard/${businessId}`}
        backLabel="Dashboard"
        title="Orders"
        description="Orders this business has taken, newest first."
        actions={
          <Link
            href={`${listHref}/new`}
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-white transition-colors hover:bg-ink"
          >
            New order
          </Link>
        }
      />

      <form
        action={listHref}
        method="get"
        className="rounded-lg border border-line bg-surface p-4 sm:p-5"
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_210px_auto] sm:items-end">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="order-search" className="text-sm font-medium text-ink">
              Search
            </label>
            <input
              id="order-search"
              name="q"
              type="search"
              defaultValue={isSearching && query.q ? query.q : ""}
              maxLength={ORDER_SEARCH_MAX_LENGTH}
              placeholder="Order number or customer"
              className="min-h-11 w-full rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="order-status" className="text-sm font-medium text-ink">
              Status
            </label>
            <select
              id="order-status"
              name="status"
              defaultValue={query.status ?? ""}
              className="min-h-11 w-full rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
            >
              <option value="">All statuses</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {orderStatusLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-raised"
            >
              Apply
            </button>
            {isFiltered && (
              <Link
                href={listHref}
                className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                Clear
              </Link>
            )}
          </div>
        </div>
      </form>

      {hasNotices && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-md border border-status-negative-fg/25 bg-status-negative-bg px-3 py-2 text-sm text-status-negative-fg"
        >
          {parsed.searchError && <p>{parsed.searchError}</p>}
          {parsed.statusError && <p>{parsed.statusError}</p>}
          {parsed.pageError && <p>{parsed.pageError}</p>}
        </div>
      )}

      {result.orders.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-6">
          {result.total > 0 ? (
            <>
              <p className="text-sm font-medium text-ink">
                Page {result.page} is past the end of this list.
              </p>
              <Link
                href={pageHref(1)}
                className="mt-3 inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
              >
                Go back to page 1
              </Link>
            </>
          ) : isFiltered ? (
            <>
              <p className="text-sm font-medium text-ink">No orders match</p>
              <p className="mt-1 text-sm text-muted">
                {isSearching ? `No orders match “${query.q}”` : "No orders match this filter"}
                {isSearching && isFiltering
                  ? ` with status ${orderStatusLabel(String(query.status))}`
                  : ""}
                .
              </p>
              <Link
                href={listHref}
                className="mt-3 inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
              >
                Clear filters
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">No orders yet</p>
              <p className="mt-1 text-sm text-muted">
                Create the first order once at least one product exists.
              </p>
              <Link
                href={`${listHref}/new`}
                className="mt-3 inline-flex min-h-11 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-white transition-colors hover:bg-ink"
              >
                New order
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-line bg-surface md:block">
            <table className="min-w-full divide-y divide-line text-sm">
              <caption className="sr-only">Orders</caption>
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
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-muted">
                    Payment
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
                {result.orders.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-raised">
                    <td className="whitespace-nowrap px-5 py-4">
                      <Link
                        href={`${listHref}/${order.id}`}
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
                    <td className="px-5 py-4">
                      <PaymentStatusBadge status={order.paymentStatus} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right font-medium text-ink tabular-nums">
                      {formatMoney(business.currency, order.total)}
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
            {result.orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`${listHref}/${order.id}`}
                  className="block px-4 py-4 transition-colors hover:bg-raised"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-mono text-[13px] font-medium text-ink">
                      {order.orderNumber}
                    </span>
                    <span className="shrink-0 text-sm font-medium text-ink tabular-nums">
                      {formatMoney(business.currency, order.total)}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-sm text-ink">
                    {order.customerName}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <OrderStatusBadge status={order.status} />
                    <PaymentStatusBadge status={order.paymentStatus} />
                    <span>{order.createdAt.toLocaleDateString()}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {result.total > 0 && result.orders.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <p>
            Page {result.page} of {result.totalPages} · {result.total}{" "}
            {result.total === 1 ? "order" : "orders"}
          </p>
          <div className="flex items-center gap-2">
            {result.page > 1 && (
              <Link
                href={pageHref(result.page - 1)}
                className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 font-medium text-ink transition-colors hover:bg-raised"
              >
                Previous
              </Link>
            )}
            {result.page < result.totalPages && (
              <Link
                href={pageHref(result.page + 1)}
                className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 font-medium text-ink transition-colors hover:bg-raised"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
