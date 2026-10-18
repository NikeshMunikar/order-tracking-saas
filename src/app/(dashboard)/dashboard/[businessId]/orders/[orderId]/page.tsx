import Link from "next/link";

import { requireSession } from "@/server/auth/session";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { getOrder } from "@/server/order/order-service";

// M5 order detail (MASTER_SPEC.md §9/§10/§12 "View"). Everything shown is the
// stored record: money values are the server-calculated DEC-006 decimal
// strings, item lines are the §10 snapshots taken at order time, and the
// status history is the §8-required audit trail. Status CHANGES are an M6
// concern; payment status changes go through Edit. The public tracking token
// is deliberately NOT rendered anywhere here — the customer-facing tracking
// page/copy-share flow belongs to a later milestone.

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; orderId: string }>;
}) {
  const { businessId, orderId } = await params;
  const session = await requireSession();

  const authorized = await getAuthorizedBusiness(session.user.id, businessId);

  const order = await getOrder(session.user.id, businessId, orderId);
  if (!order) {
    // Same indistinguishable-block pattern as customers/products: a foreign
    // or missing id is a plain "not found" card, never an error page.
    return (
      <div className="max-w-lg rounded-md border border-neutral-200 bg-white p-6">
        <h2 className="text-base font-semibold text-neutral-900">Order not found</h2>
        <p className="mt-2 text-sm text-neutral-600">
          This order is not in {authorized.business.name}, or has been removed.
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

  const listHref = `/dashboard/${businessId}/orders`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={listHref} className="text-sm text-neutral-500 hover:text-neutral-900">
            &larr; Orders
          </Link>
          <h2 className="mt-1 text-base font-semibold text-neutral-900">
            Order {order.orderNumber}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {order.customerName} &middot; Created {order.createdAt.toLocaleDateString()}
          </p>
        </div>
        <Link
          href={`${listHref}/${order.id}/edit`}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          Edit order
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900">Overview</h3>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Status</dt>
              <dd className="text-neutral-900">{order.status}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Payment status</dt>
              <dd className="text-neutral-900">{order.paymentStatus}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Delivery type</dt>
              <dd className="text-neutral-900">{order.deliveryType}</dd>
            </div>
            {order.estimatedDeliveryAt && (
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">Estimated delivery</dt>
                <dd className="text-neutral-900">
                  {order.estimatedDeliveryAt.toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-md border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900">Amounts</h3>
          {/* Server-calculated decimal strings (§29 + DEC-006) — never the
              browser's arithmetic. */}
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Subtotal</dt>
              <dd className="text-neutral-900">{order.subtotal}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Discount</dt>
              <dd className="text-neutral-900">{order.discount}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Delivery fee</dt>
              <dd className="text-neutral-900">{order.deliveryFee}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-neutral-200 pt-2">
              <dt className="font-medium text-neutral-700">Total</dt>
              <dd className="font-medium text-neutral-900">{order.total}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="rounded-md border border-neutral-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-neutral-900">Items</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead>
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-medium text-neutral-500">
                  Product
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-neutral-500">
                  Unit price
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-neutral-500">
                  Quantity
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-neutral-500">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2 font-medium text-neutral-900">
                    {item.productNameSnapshot}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">{item.unitPrice}</td>
                  <td className="px-4 py-2 text-neutral-700">{item.quantity}</td>
                  <td className="px-4 py-2 text-neutral-900">{item.subtotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900">Delivery</h3>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Recipient</dt>
              <dd className="text-neutral-900">{order.deliveryName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Phone</dt>
              <dd className="text-neutral-900">{order.deliveryPhone}</dd>
            </div>
            {order.deliveryAddress !== "" && (
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">Address</dt>
                <dd className="text-right text-neutral-900">{order.deliveryAddress}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-md border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900">Status history</h3>
          {/* docs/database.md §8: every status change writes a row; the initial
              creation row has a null oldStatus. M6 adds the change actions. */}
          <ol className="mt-3 flex flex-col gap-2 text-sm text-neutral-700">
            {order.statusHistory.map((entry) => (
              <li key={entry.id}>
                {entry.oldStatus ?? "—"} &rarr; {entry.newStatus}
                <span className="text-neutral-400">
                  {" "}
                  &middot; {entry.createdAt.toLocaleString()}
                </span>
                {entry.note && <span className="text-neutral-500"> &middot; {entry.note}</span>}
              </li>
            ))}
          </ol>
          {order.notes !== "" && (
            <p className="mt-4 border-t border-neutral-200 pt-3 text-sm text-neutral-600">
              <span className="font-medium text-neutral-700">Notes: </span>
              {order.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
