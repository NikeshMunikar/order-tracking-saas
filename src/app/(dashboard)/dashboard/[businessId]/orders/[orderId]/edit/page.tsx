import Link from "next/link";

import { EditOrderForm } from "@/components/order/order-forms";
import { requireSession } from "@/server/auth/session";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { getOrder } from "@/server/order/order-service";
import { listProducts } from "@/server/product/product-service";
import { toDatetimeLocal } from "@/components/order/datetime";

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
      <div className="max-w-lg rounded-md border border-neutral-200 bg-white p-6">
        <h2 className="text-base font-semibold text-neutral-900">Order not found</h2>
        <p className="mt-2 text-sm text-neutral-600">
          This order is not in this business, or has been removed.
        </p>
        <Link
          href={`/dashboard/${businessId}/orders`}
          className="mt-4 inline-block text-sm font-medium text-neutral-700 underline underline-offset-2"
        >
          &larr; Back to orders
        </Link>
      </div>
    );
  }

  const products = await listProducts(session.user.id, businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/${businessId}/orders/${orderId}`}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          &larr; {order.orderNumber}
        </Link>
        <h2 className="mt-1 text-base font-semibold text-neutral-900">
          Edit order {order.orderNumber}
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Item changes snapshot the CURRENT product prices; totals are
          recalculated on the server.
        </p>
      </div>

      <div className="rounded-md border border-neutral-200 bg-white p-6">
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
    </div>
  );
}
