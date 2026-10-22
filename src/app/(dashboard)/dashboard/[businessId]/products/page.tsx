import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/lib/money";
import {
  PRODUCT_SEARCH_MAX_LENGTH,
  parseProductSearchQuery,
} from "@/lib/validation/product";
import { requireSession } from "@/server/auth/session";
import { BusinessNotFoundError } from "@/server/business/errors";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { listProducts } from "@/server/product/product-service";

export default async function ProductsPage({
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
  const isOwner = authorized.role === "OWNER";
  const parsed = parseProductSearchQuery({ q: rawSearchParams.q });
  const query = parsed.q;
  const isSearching = typeof query === "string" && query.length > 0;
  const listHref = `/dashboard/${businessId}/products`;

  const products = await listProducts(session.user.id, businessId, { query });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref={`/dashboard/${businessId}`}
        backLabel="Dashboard"
        title="Products"
        description="Items this business sells."
        actions={
          isOwner ? (
            <Link
              href={`${listHref}/new`}
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-white transition-colors hover:bg-ink"
            >
              Add product
            </Link>
          ) : undefined
        }
      />

      <form
        action={listHref}
        method="get"
        className="rounded-lg border border-line bg-surface p-4 sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="product-search" className="text-sm font-medium text-ink">
              Search
            </label>
            <input
              id="product-search"
              name="q"
              type="search"
              defaultValue={isSearching && query ? query : ""}
              maxLength={PRODUCT_SEARCH_MAX_LENGTH}
              placeholder="Name"
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

      {parsed.searchError && (
        <p
          role="alert"
          className="rounded-md border border-status-negative-fg/25 bg-status-negative-bg px-3 py-2 text-sm text-status-negative-fg"
        >
          {parsed.searchError}
        </p>
      )}

      {products.length === 0 ? (
        <EmptyState
          title={isSearching ? "No products match" : "No products yet"}
          description={
            isSearching
              ? `No products match “${query}”.`
              : isOwner
                ? "Add your first product to start taking orders."
                : "The business owner has not added any products yet."
          }
          action={
            isSearching ? (
              <Link
                href={listHref}
                className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
              >
                Clear search
              </Link>
            ) : isOwner ? (
              <Link
                href={`${listHref}/new`}
                className="inline-flex min-h-11 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-white transition-colors hover:bg-ink"
              >
                Add product
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-line bg-surface md:block">
            <table className="min-w-full divide-y divide-line text-sm">
              <caption className="sr-only">Products</caption>
              <thead>
                <tr>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-muted">
                    Name
                  </th>
                  <th scope="col" className="px-5 py-3 text-right text-xs font-medium text-muted">
                    Price
                  </th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-muted">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-muted">
                    Added
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {products.map((product) => (
                  <tr key={product.id} className="transition-colors hover:bg-raised">
                    <td className="max-w-[24rem] truncate px-5 py-4">
                      <Link
                        href={`${listHref}/${product.id}`}
                        className="font-medium text-ink underline underline-offset-2"
                      >
                        {product.name}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right text-ink tabular-nums">
                      {formatMoney(business.currency, product.price)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge tone={product.active ? "positive" : "neutral"}>
                        {product.active ? "Active" : "Inactive"}
                      </StatusBadge>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-muted">
                      {product.createdAt.toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface md:hidden">
            {products.map((product) => (
              <li key={product.id}>
                <Link
                  href={`${listHref}/${product.id}`}
                  className="block px-4 py-4 transition-colors hover:bg-raised"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{product.name}</span>
                      <span className="mt-1 block text-sm text-ink tabular-nums">
                        {formatMoney(business.currency, product.price)}
                      </span>
                    </span>
                    <StatusBadge tone={product.active ? "positive" : "neutral"}>
                      {product.active ? "Active" : "Inactive"}
                    </StatusBadge>
                  </span>
                  <span className="mt-2 block text-xs text-muted">
                    Added {product.createdAt.toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
