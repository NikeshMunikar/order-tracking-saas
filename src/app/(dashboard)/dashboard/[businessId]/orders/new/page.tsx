import { CreateOrderForm } from "@/components/order/order-forms";
import { OrderPageHeader } from "@/components/order/order-page-header";
import { requireSession } from "@/server/auth/session";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { listCustomerOptions } from "@/server/customer/customer-service";
import { listProductOptions } from "@/server/product/product-service";

// M5 order-creation page (MASTER_SPEC.md §18 flow: customer, products,
// quantity, delivery/pickup, discount, delivery fee, payment status,
// estimated delivery, notes). The option lists come from server-side,
// membership-guarded services; the totals shown later on the order page are
// calculated ONLY server-side (§29) — this form displays no amounts.
//
// M8 (§18 "Search customer"): the customer/product selectors gained a
// type-to-filter box over the server-loaded, membership-scoped option lists;
// the product options now come from `listProductOptions` (ACTIVE, non-deleted
// products only).

export default async function NewOrderPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const session = await requireSession();

  // getAuthorizedBusiness resolves membership for the URL businessId; a
  // non-member gets the same "no access" response as the other pages.
  const authorized = await getAuthorizedBusiness(session.user.id, businessId);

  const [customers, products] = await Promise.all([
    listCustomerOptions(session.user.id, businessId),
    listProductOptions(session.user.id, businessId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <OrderPageHeader
        backHref={`/dashboard/${businessId}/orders`}
        backLabel="Orders"
        title="New order"
        description="Pick a customer, add items and set delivery details. Totals are calculated on the server."
      />

      <CreateOrderForm
        businessId={businessId}
        currency={authorized.business.currency}
        customers={customers}
        products={products}
      />
    </div>
  );
}
