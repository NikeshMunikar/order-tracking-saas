import Link from "next/link";

import { CUSTOMER_SEARCH_MAX_LENGTH, parseCustomerListQuery } from "@/lib/validation/customer";
import { requireSession } from "@/server/auth/session";
import { listCustomers } from "@/server/customer/customer-service";

/**
 * Customer list (MASTER_SPEC.md §19 / milestone 3: CRUD, search, details).
 *
 * Authorization: `listCustomers` re-resolves the caller's membership for the
 * `businessId` from the URL server-side; the URL segment is only a
 * navigation identifier. A non-member gets the same generic "no access"
 * response from the business layout, never a hint that the business exists.
 *
 * Search covers name and phone (docs/ui-ux.md §8: "search and show at least
 * name, phone…"; docs/database.md §4 identifies phone as a customer access
 * path). The search is a plain GET form, so it needs no client JavaScript.
 *
 * The `q` and `page` query parameters are parsed independently (M3 audit F3):
 * a malformed `page` falls back to page 1 with a visible notice without
 * discarding a valid search term, and a page number past the last matching
 * page renders an explicit out-of-range state instead of the "no customers"
 * state or a false "Page X of Y" footer.
 *
 * NOT IMPLEMENTED HERE: the "order count" and "last order" columns described
 * in MASTER_SPEC.md §19 and docs/ui-ux.md §8. Orders do not exist until
 * milestone 5, so there is no authoritative source for those values and they
 * are deliberately omitted rather than rendered as fabricated zeros.
 */
export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const { businessId } = await params;
  const rawQuery = await searchParams;

  // M3 audit F3: `q` and `page` are validated independently, so a malformed
  // `page` falls back to page 1 with a notice instead of silently discarding a
  // valid search term (and vice versa).
  const parsed = parseCustomerListQuery({ q: rawQuery.q, page: rawQuery.page });
  const query = { q: parsed.q, page: parsed.page };
  const searchError = parsed.searchError ?? null;
  const pageError = parsed.pageError ?? null;

  const result = await listCustomers(session.user.id, businessId, {
    query: query.q,
    page: query.page,
  });

  const isSearching = typeof query.q === "string" && query.q.length > 0;
  const listHref = `/dashboard/${businessId}/customers`;

  function pageHref(page: number) {
    const search = new URLSearchParams();
    if (isSearching) {
      search.set("q", query.q as string);
    }
    if (page > 1) {
      search.set("page", String(page));
    }
    const suffix = search.toString();
    return suffix ? `${listHref}?${suffix}` : listHref;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Customers</h2>
          <p className="mt-1 text-sm text-neutral-500">
            People this business delivers to.
          </p>
        </div>
        <Link
          href={`${listHref}/new`}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          Add customer
        </Link>
      </div>

      <form action={listHref} method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="customer-search" className="text-sm font-medium text-neutral-700">
            Search
          </label>
          <input
            id="customer-search"
            name="q"
            type="search"
            defaultValue={isSearching ? (query.q as string) : ""}
            maxLength={CUSTOMER_SEARCH_MAX_LENGTH}
            placeholder="Name or phone"
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
        >
          Search
        </button>
        {isSearching && (
          <Link
            href={listHref}
            className="pb-2 text-sm font-medium text-neutral-700 underline underline-offset-2"
          >
            Clear
          </Link>
        )}
      </form>

      {(searchError || pageError) && (
        <div role="alert" className="flex flex-col gap-1 text-sm text-red-600">
          {searchError && <p>{searchError}</p>}
          {pageError && <p>{pageError}</p>}
        </div>
      )}

      {result.customers.length === 0 ? (
        result.total > 0 ? (
          // M3 audit F3: a page beyond the last matching page is not "no
          // customers" — matches exist but this page is empty. Say that
          // truthfully instead of the no-data state or a false page footer.
          <div className="flex flex-col gap-2 text-sm text-neutral-500">
            <p>
              Page {result.page} is past the end of this list. There{" "}
              {result.total === 1
                ? "is 1 matching customer"
                : `are ${result.total} matching customers`}{" "}
              on {result.totalPages} {result.totalPages === 1 ? "page" : "pages"} in total.
            </p>
            <p>
              <Link href={pageHref(1)} className="text-neutral-900 underline underline-offset-2">
                Go back to page 1
              </Link>
            </p>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">
            {isSearching
              ? `No customers match “${query.q}”.`
              : "No customers yet. Add your first customer to start creating orders for them."}
          </p>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <caption className="sr-only">Customers</caption>
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th scope="col" className="py-2 pr-4">
                  Name
                </th>
                <th scope="col" className="py-2 pr-4">
                  Phone
                </th>
                <th scope="col" className="hidden py-2 pr-4 sm:table-cell">
                  Email
                </th>
                <th scope="col" className="py-2">
                  Added
                </th>
              </tr>
            </thead>
            <tbody>
              {result.customers.map((customer) => (
                <tr key={customer.id} className="border-b border-neutral-100 last:border-b-0">
                  <th scope="row" className="py-3 pr-4 text-left font-medium text-neutral-900">
                    <Link
                      href={`${listHref}/${customer.id}`}
                      className="underline underline-offset-2"
                    >
                      {customer.name}
                    </Link>
                  </th>
                  <td className="py-3 pr-4 text-neutral-700">{customer.phone}</td>
                  <td className="hidden py-3 pr-4 text-neutral-700 sm:table-cell">
                    {customer.email ?? "—"}
                  </td>
                  <td className="py-3 text-neutral-500">
                    {customer.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.total > 0 && result.customers.length > 0 && (
        <div className="flex items-center justify-between gap-4 text-sm text-neutral-500">
          <span>
            Page {result.page} of {result.totalPages} &middot; {result.total}{" "}
            {result.total === 1 ? "customer" : "customers"}
          </span>
          <span className="flex gap-4">
            {result.page > 1 && (
              <Link href={pageHref(result.page - 1)} className="font-medium text-neutral-900 underline underline-offset-2">
                Previous
              </Link>
            )}
            {result.page < result.totalPages && (
              <Link href={pageHref(result.page + 1)} className="font-medium text-neutral-900 underline underline-offset-2">
                Next
              </Link>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
