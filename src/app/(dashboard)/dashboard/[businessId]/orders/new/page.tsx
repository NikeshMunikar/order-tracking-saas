import Link from "next/link";

import { CreateOrderForm } from "@/components/order/order-forms";
import { requireSession } from "@/server/auth/session";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { listCustomerOptions } from "@/server/customer/customer-service";
import { listProducts } from "@/server/product/product-service";

// M5 order-creation page (MASTER_SPEC.md §18 flow: customer, products,
// quantity, delivery/pickup, discount, delivery fee, payment status,
// estimated delivery, notes). The option lists come from server-side,
// membership-guarded services; the totals shown later on the order page are
// calculated ONLY server-side (§29) — this form displays no amounts.
//
// The customer/product dropdowns are simple selects (§18 shows a search
// affordance; search-driven pickers are deferred with the dashboard
// search/filter milestone).

export default async function NewOrderPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const session = await requireSession();

  // getAuthorizedBusiness resolves membership for the URL businessId; a
  // non-member gets the same "no access" response as the other pages.
  await getAuthorizedBusiness(session.user.id, businessId);

  const [customers, products] = await Promise.all([
    listCustomerOptions(session.user.id, businessId),
    listProducts(session.user.id, businessId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/${businessId}/orders`}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          &larr; Orders
        </Link>
        <h2 className="mt-1 text-base font-semibold text-neutral-900">New order</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Pick a customer, add items and set delivery details. Totals are
          calculated on the server.
        </p>
      </div>

      <div className="rounded-md border border-neutral-200 bg-white p-6">
        <CreateOrderForm
          businessId={businessId}
          customers={customers}
          products={products.filter((product) => product.active)}
        />
      </div>
    </div>
  );
}
