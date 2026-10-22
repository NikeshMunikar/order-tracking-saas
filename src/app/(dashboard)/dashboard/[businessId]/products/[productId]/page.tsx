import Link from "next/link";

import { DeleteProductButton, ProductForm } from "@/components/product/product-forms";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/lib/money";
import { requireSession } from "@/server/auth/session";
import { BusinessNotFoundError } from "@/server/business/errors";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { getProduct } from "@/server/product/product-service";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
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

  const isOwner = authorized.role === "OWNER";
  const product = await getProduct(session.user.id, businessId, productId);

  if (!product) {
    return (
      <div className="max-w-lg rounded-lg border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Product not found</h2>
        <p className="mt-2 text-sm text-muted">
          This product is not in {authorized.business.name}, or has been removed.
        </p>
        <Link
          href={`/dashboard/${businessId}/products`}
          className="mt-4 inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
        >
          &larr; Back to products
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref={`/dashboard/${businessId}/products`}
        backLabel="Products"
        title={product.name}
        description={`${formatMoney(authorized.business.currency, product.price)} · Added ${product.createdAt.toLocaleDateString()}`}
        actions={
          <StatusBadge tone={product.active ? "positive" : "neutral"}>
            {product.active ? "Active" : "Inactive"}
          </StatusBadge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <SectionCard>
          <ProductForm
            businessId={businessId}
            productId={product.id}
            defaultValues={{
              name: product.name,
              description: product.description ?? "",
              price: product.price,
              active: product.active,
            }}
          />
        </SectionCard>

        {isOwner && (
          <SectionCard title="Delete product">
            <DeleteProductButton businessId={businessId} productId={product.id} />
          </SectionCard>
        )}
      </div>
    </div>
  );
}
