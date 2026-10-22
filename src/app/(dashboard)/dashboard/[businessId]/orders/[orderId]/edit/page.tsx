import Link from "next/link";

import { EditOrderForm } from "@/components/order/order-forms";
import { OrderPageHeader } from "@/components/order/order-page-header";
import { toDatetimeLocal } from "@/components/order/datetime";
import { requireSession } from "@/server/auth/session";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { getOrder } from "@/server/order/order-service";
import { listProducts } from "@/server/product/product-service";

// M5 order-edit page (full edit scope as decided 2026-10-18: items, delivery
// info, fee/discount, payment status, estimated delivery and notes — the
// customer reference is NOT editable). Totals are recalculated entirely
// server-side from current product prices and submitted quantities.

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ businessId: string; orderId: string }>;
}) {
  const { businessId, orderId } = await params;
  const session = await requireSession();

  const authorized = await getAuthorizedBusiness(session.user.id, businessId);

  const order = await getOrder(session.user.id, businessId, orderId);
  if (!order) {
    return (
      <div className="max-w-lg rounded-lg border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Order not found</h2>
        <p className="mt-2 text-sm text-muted">
          This order is not in this business, or has been removed.
        </p>
        <Link
          href={`/dashboard/${businessId}/orders`}
          className="mt-4 inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
        >
          &larr; Back to orders
        </Link>
      </div>
    );
  }

  const products = await listProducts(session.user.id, businessId);

  return (
    <div className="flex flex-col gap-6">
      <OrderPageHeader
        backHref={`/dashboard/${businessId}/orders/${orderId}`}
        backLabel={order.orderNumber}
        title={`Edit order ${order.orderNumber}`}
        description="Item changes snapshot the current product prices; totals are recalculated on the server."
      />

      <EditOrderForm
        businessId={businessId}
        currency={authorized.business.currency}
        orderId={order.id}
        products={products.filter((product) => product.active)}
        defaultValues={{
          deliveryType: order.deliveryType,
          deliveryName: order.deliveryName,
          deliveryPhone: order.deliveryPhone,
          deliveryAddress: order.deliveryAddress,
          discount: order.discount,
          deliveryFee: order.deliveryFee,
          estimatedDeliveryAt: toDatetimeLocal(order.estimatedDeliveryAt),
          paymentStatus: order.paymentStatus,
          notes: order.notes,
        }}
        initialRows={order.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        }))}
      />
    </div>
  );
}
