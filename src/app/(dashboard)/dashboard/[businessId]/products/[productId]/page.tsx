import Link from "next/link";

import {
  DeleteProductButton,
  ProductForm,
} from "@/components/product/product-forms";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { BusinessNotFoundError } from "@/server/business/errors";
import { getProduct } from "@/server/product/product-service";
import { requireSession } from "@/server/auth/session";

// M4 product detail: view + edit a single product. getProduct returns null
// for a missing, soft-deleted, or foreign productId — one indistinguishable
// not-found condition (no cross-tenant existence leak). OWNER-only mutation
// controls are hidden for STAFF; the product service enforces OWNER-only
// writes regardless of what the UI renders.

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const session = await requireSession();

  let isOwner = false;
  let businessName: string;
  try {
    const authorized = await getAuthorizedBusiness(session.user.id, businessId);
    isOwner = authorized.role === "OWNER";
    businessName = authorized.business.name;
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

  const product = await getProduct(session.user.id, businessId, productId);

  if (!product) {
    return (
      <div className="max-w-lg rounded-md border border-neutral-200 bg-white p-6">
        <h2 className="text-base font-semibold text-neutral-900">Product not found</h2>
        <p className="mt-2 text-sm text-neutral-600">
          This product is not in {businessName}, or has been removed.
        </p>
        <Link
          href={`/dashboard/${businessId}/products`}
          className="mt-4 inline-block text-sm font-medium text-neutral-700 underline underline-offset-2"
        >
          &larr; Back to products
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/dashboard/${businessId}/products`}
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        &larr; Products
      </Link>

      <div>
        <h2 className="text-base font-semibold text-neutral-900">{product.name}</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Product &middot; Added {product.createdAt.toLocaleDateString()}
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Details
        </h3>
        <ProductForm
          businessId={businessId}
          productId={product.id}
          defaultValues={{
            name: product.name,
            description: product.description,
            price: product.price,
            active: product.active,
          }}
        />
      </section>

      {/*
        Soft deletion is an OWNER-only authority (MASTER_SPEC.md §4): STAFF
        does not see this control, and the product service refuses the
        operation server-side for non-OWNER members regardless.
      */}
      {isOwner && (
        <section className="flex flex-col gap-4 border-t border-neutral-200 pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Delete
          </h3>
          <DeleteProductButton businessId={businessId} productId={product.id} />
        </section>
      )}
    </div>
  );
}
