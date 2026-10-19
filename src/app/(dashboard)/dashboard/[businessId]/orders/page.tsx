import Link from "next/link";

import { getAuthorizedBusiness } from "@/server/business/queries";
import { BusinessNotFoundError } from "@/server/business/errors";
import { listOrders } from "@/server/order/order-service";
import { requireSession } from "@/server/auth/session";
import {
  ORDER_SEARCH_MAX_LENGTH,
  parseOrderListQuery,
} from "@/lib/validation/order";
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

  const parsed = parseOrderListQuery({
    q: rawSearchParams.q,
    status: rawSearchParams.status,
    page: rawSearchParams.page,
  });
  const query = { q: parsed.q, status: parsed.status, page: parsed.page };
  const listHref = `/dashboard/${businessId}/orders`;

  // Membership was already verified above; listOrders re-checks it inside the
  // service so every entry point resolves authorization the same way.
  const result = isMember
    ? await listOrders(session.user.id, businessId, {
        query: query.q,
        status: query.status,
        page: query.page,
      })
    : { orders: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };

  const isSearching = typeof query.q === "string" && query.q.length > 0;
  const isFiltering = query.status !== undefined;
  const hasNotices = Boolean(parsed.searchError || parsed.statusError || parsed.pageError);

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

      <form action={listHref} method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="order-search" className="text-sm font-medium text-neutral-700">
            Search
          </label>
          <input
            id="order-search"
            name="q"
            type="search"
            defaultValue={isSearching ? query.q : ""}
            maxLength={ORDER_SEARCH_MAX_LENGTH}
            placeholder="Order number or customer"
            className="w-64 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="order-status" className="text-sm font-medium text-neutral-700">
            Status
          </label>
          <select
            id="order-status"
            name="status"
            defaultValue={query.status ?? ""}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {orderStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
        >
          Apply
        </button>
        {(isSearching || isFiltering) && (
          <Link
            href={listHref}
            className="rounded-md px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900"
          >
            Clear
          </Link>
        )}
      </form>

      {hasNotices && (
        <div role="alert" className="flex flex-col gap-1 text-sm text-red-600">
          {parsed.searchError && <p>{parsed.searchError}</p>}
          {parsed.statusError && <p>{parsed.statusError}</p>}
          {parsed.pageError && <p>{parsed.pageError}</p>}
        </div>
      )}

      {result.orders.length === 0 ? (
        result.total > 0 ? (
          <div className="rounded-md border border-neutral-200 bg-white p-6">
            <p className="text-sm text-neutral-600">
              Page {result.page} is past the end of this list.
            </p>
            <Link
              href={pageHref(1)}
              className="mt-2 inline-block text-sm font-medium text-neutral-900 underline underline-offset-2"
            >
              Go back to page 1
            </Link>
          </div>
        ) : isSearching || isFiltering ? (
          <div className="rounded-md border border-neutral-200 bg-white p-6">
            <p className="text-sm text-neutral-600">
              No orders match {isSearching ? `“${query.q}”` : "this filter"}
              {isSearching && isFiltering ? ` with status ${orderStatusLabel(String(query.status))}` : ""}.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-neutral-200 bg-white p-6">
            <p className="text-sm text-neutral-600">No orders yet.</p>
            <p className="mt-1 text-sm text-neutral-500">
              Create the first order once at least one product exists.
            </p>
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <caption className="sr-only">Orders</caption>
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
              {result.orders.map((order) => (
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
                  <td className="px-4 py-3 text-neutral-700">{orderStatusLabel(order.status)}</td>
                  <td className="px-4 py-3 text-neutral-700">{order.paymentStatus}</td>
                  <td className="px-4 py-3 text-neutral-900">NPR {order.total}</td>
                  <td className="px-4 py-3 text-neutral-500">
                    {order.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.total > 0 && result.orders.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-500">
          <p>
            Page {result.page} of {result.totalPages} · {result.total} orders
          </p>
          <div className="flex gap-4">
            {result.page > 1 && (
              <Link
                href={pageHref(result.page - 1)}
                className="font-medium text-neutral-900 underline underline-offset-2"
              >
                Previous
              </Link>
            )}
            {result.page < result.totalPages && (
              <Link
                href={pageHref(result.page + 1)}
                className="font-medium text-neutral-900 underline underline-offset-2"
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
