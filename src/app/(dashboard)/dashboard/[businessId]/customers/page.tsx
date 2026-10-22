import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireSession } from "@/server/auth/session";
import {
  CUSTOMER_SEARCH_MAX_LENGTH,
  parseCustomerListQuery,
} from "@/lib/validation/customer";
import { listCustomers } from "@/server/customer/customer-service";

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessId } = await params;
  const rawSearchParams = await searchParams;
  const session = await requireSession();

  const parsed = parseCustomerListQuery({
    q: rawSearchParams.q,
    page: rawSearchParams.page,
  });
  const query = { q: parsed.q, page: parsed.page };
  const searchError = parsed.searchError ?? null;
  const pageError = parsed.pageError ?? null;

  const result = await listCustomers(session.user.id, businessId, {
    query: query.q,
    page: query.page,
  });

  const isSearching = typeof query.q === "string" && query.q.length > 0;
  const listHref = `/dashboard/${businessId}/customers`;

  const pageHref = (page: number) => {
    const next = new URLSearchParams();
    if (isSearching && query.q) next.set("q", query.q);
    if (page > 1) next.set("page", String(page));
    const queryString = next.toString();
    return queryString === "" ? listHref : `${listHref}?${queryString}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref={`/dashboard/${businessId}`}
        backLabel="Dashboard"
        title="Customers"
        description="People this business delivers to."
        actions={
          <Link
            href={`${listHref}/new`}
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-white transition-colors hover:bg-ink"
          >
            Add customer
          </Link>
        }
      />

      <form
        action={listHref}
        method="get"
        className="rounded-lg border border-line bg-surface p-4 sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="customer-search" className="text-sm font-medium text-ink">
              Search
            </label>
            <input
              id="customer-search"
              name="q"
              type="search"
              defaultValue={isSearching && query.q ? query.q : ""}
              maxLength={CUSTOMER_SEARCH_MAX_LENGTH}
              placeholder="Name or phone"
              className="min-h-11 w-full rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-raised"
            >
              Search
            </button>
            {isSearching && (
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

      {(searchError || pageError) && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-md border border-status-negative-fg/25 bg-status-negative-bg px-3 py-2 text-sm text-status-negative-fg"
        >
          {searchError && <p>{searchError}</p>}
          {pageError && <p>{pageError}</p>}
        </div>
      )}

      {result.customers.length === 0 ? (
        result.total > 0 ? (
          <EmptyState
            title={`Page ${result.page} is past the end of this list.`}
            description={`There ${result.total === 1 ? "is" : "are"} ${result.total} matching ${
              result.total === 1 ? "customer" : "customers"
            } on ${result.totalPages} ${result.totalPages === 1 ? "page" : "pages"} in total.`}
            action={
              <Link
                href={pageHref(1)}
                className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
              >
                Go back to page 1
              </Link>
            }
          />
        ) : isSearching ? (
          <EmptyState
            title="No customers match"
            description={`No customers match “${query.q}”.`}
            action={
              <Link
                href={listHref}
                className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
              >
                Clear search
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No customers yet"
            description="Add your first customer to start creating orders for them."
            action={
              <Link
                href={`${listHref}/new`}
                className="inline-flex min-h-11 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-white transition-colors hover:bg-ink"
              >
                Add customer
              </Link>
            }
          />
        )
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-line bg-surface md:block">
            <table className="min-w-full divide-y divide-line text-sm">
              <caption className="sr-only">Customers</caption>
              <thead>
                <tr>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-muted">
                    Name
                  </th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-muted">
                    Phone
                  </th>
                  <th
                    scope="col"
                    className="hidden px-5 py-3 text-left text-xs font-medium text-muted lg:table-cell"
                  >
                    Email
                  </th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-muted">
                    Orders
                  </th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-muted">
                    Last order
                  </th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-muted">
                    Added
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.customers.map((customer) => (
                  <tr key={customer.id} className="transition-colors hover:bg-raised">
                    <td className="max-w-[16rem] truncate px-5 py-4">
                      <Link
                        href={`${listHref}/${customer.id}`}
                        className="font-medium text-ink underline underline-offset-2"
                      >
                        {customer.name}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-ink">{customer.phone}</td>
                    <td className="hidden max-w-[16rem] truncate px-5 py-4 text-muted lg:table-cell">
                      {customer.email ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-ink tabular-nums">{customer.ordersCount}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-muted">
                      {customer.lastOrder
                        ? `${customer.lastOrder.orderNumber} · ${customer.lastOrder.createdAt.toLocaleDateString()}`
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-muted">
                      {customer.createdAt.toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface md:hidden">
            {result.customers.map((customer) => (
              <li key={customer.id}>
                <Link
                  href={`${listHref}/${customer.id}`}
                  className="block px-4 py-4 transition-colors hover:bg-raised"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{customer.name}</span>
                      <span className="mt-1 block text-sm text-muted">{customer.phone}</span>
                      {customer.email && (
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {customer.email}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {customer.ordersCount} {customer.ordersCount === 1 ? "order" : "orders"}
                    </span>
                  </span>
                  <span className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span>
                      {customer.lastOrder
                        ? `Last ${customer.lastOrder.orderNumber} · ${customer.lastOrder.createdAt.toLocaleDateString()}`
                        : "No orders yet"}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Added {customer.createdAt.toLocaleDateString()}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {result.total > 0 && result.customers.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <p>
            Page {result.page} of {result.totalPages} · {result.total}{" "}
            {result.total === 1 ? "customer" : "customers"}
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
