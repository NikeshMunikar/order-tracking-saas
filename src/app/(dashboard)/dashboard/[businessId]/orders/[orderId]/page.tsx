import Link from "next/link";

import { OrderPageHeader } from "@/components/order/order-page-header";
import { OrderStatusBadge } from "@/components/order/order-status-badge";
import { PaymentStatusBadge } from "@/components/order/payment-status-badge";
import { UpdateStatusForm } from "@/components/order/order-forms";
import { TrackingLinkActions } from "@/components/tracking/tracking-link-actions";
import { formatMoney } from "@/lib/money";
import { isOrderStatus, nextOrderStatuses, orderStatusLabel } from "@/lib/order-status";
import { requireSession } from "@/server/auth/session";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { getOrder } from "@/server/order/order-service";

// M5/M6/M7 order detail (MASTER_SPEC.md §9/§10/§12 "View"). Everything shown
// is the stored record: money values are the server-calculated DEC-006 decimal
// strings, item lines are the §10 snapshots taken at order time, and the
// status history is the §8-required audit trail. Status CHANGES use the
// DEC-013 matrix: only the server-valid next statuses are offered (§34 mobile
// friendly, docs/ui-ux.md §7 "the server remains authoritative"). Payment
// status changes go through Edit. The public tracking token is shown here to
// the authenticated business as its own copy/share link (§18/§21); the
// customer-facing page lives at /track/[token] and never renders it back.

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; orderId: string }>;
}) {
  const { businessId, orderId } = await params;
  const session = await requireSession();

  const authorized = await getAuthorizedBusiness(session.user.id, businessId);
  const currency = authorized.business.currency;

  const order = await getOrder(session.user.id, businessId, orderId);
  if (!order) {
    // Same indistinguishable-block pattern as customers/products: a foreign
    // or missing id is a plain "not found" card, never an error page.
    return (
      <div className="max-w-lg rounded-lg border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Order not found</h2>
        <p className="mt-2 text-sm text-muted">
          This order is not in {authorized.business.name}, or has been removed.
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

  const listHref = `/dashboard/${businessId}/orders`;

  // DEC-013: the server decides which changes are legal; the UI only renders
  // those (terminal statuses offer nothing).
  const nextStatuses = isOrderStatus(order.status) ? nextOrderStatuses(order.status) : [];
  const deliveryLabel =
    order.deliveryType === "DELIVERY"
      ? "Delivery"
      : order.deliveryType === "PICKUP"
        ? "Pickup"
        : order.deliveryType;

  return (
    <div className="flex flex-col gap-6">
      <OrderPageHeader
        backHref={listHref}
        backLabel="Orders"
        title={`Order ${order.orderNumber}`}
        description={`${order.customerName} · Created ${order.createdAt.toLocaleDateString()}`}
        actions={
          <Link
            href={`${listHref}/${order.id}/edit`}
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-white transition-colors hover:bg-ink"
          >
            Edit order
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-lg border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={order.status} />
              <PaymentStatusBadge status={order.paymentStatus} />
              <span className="text-sm text-muted">{deliveryLabel}</span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">Customer</dt>
                <dd className="mt-1 font-medium text-ink">{order.customerName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Created</dt>
                <dd className="mt-1 text-ink">{order.createdAt.toLocaleDateString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Estimated delivery</dt>
                <dd className="mt-1 text-ink">
                  {order.estimatedDeliveryAt
                    ? order.estimatedDeliveryAt.toLocaleString()
                    : "Not set"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold tracking-tight text-ink">Items</h3>
              <span className="text-xs text-muted">
                {order.items.length} {order.items.length === 1 ? "line" : "lines"}
              </span>
            </div>

            <div className="mt-4 hidden md:block">
              <table className="min-w-full divide-y divide-line text-sm">
                <caption className="sr-only">Order items</caption>
                <thead>
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted">
                      Product
                    </th>
                    <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-muted">
                      Unit price
                    </th>
                    <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-muted">
                      Quantity
                    </th>
                    <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-muted">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-3 font-medium text-ink">
                        {item.productNameSnapshot}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-muted tabular-nums">
                        {formatMoney(currency, item.unitPrice)}
                      </td>
                      <td className="px-3 py-3 text-right text-ink tabular-nums">
                        {item.quantity}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-ink tabular-nums">
                        {formatMoney(currency, item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="mt-4 divide-y divide-line md:hidden">
              {order.items.map((item) => (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{item.productNameSnapshot}</p>
                      <p className="mt-1 text-xs text-muted">
                        {item.quantity} × {formatMoney(currency, item.unitPrice)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium text-ink tabular-nums">
                      {formatMoney(currency, item.subtotal)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <dl className="mt-5 flex flex-col gap-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Subtotal</dt>
                <dd className="text-ink tabular-nums">
                  {formatMoney(currency, order.subtotal)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Discount</dt>
                <dd className="text-ink tabular-nums">
                  {formatMoney(currency, order.discount)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Delivery fee</dt>
                <dd className="text-ink tabular-nums">
                  {formatMoney(currency, order.deliveryFee)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-line pt-2">
                <dt className="font-medium text-ink">Total</dt>
                <dd className="text-base font-semibold text-ink tabular-nums">
                  {formatMoney(currency, order.total)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5 sm:p-6">
            <h3 className="text-lg font-semibold tracking-tight text-ink">Delivery</h3>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Recipient</dt>
                <dd className="mt-1 text-ink">{order.deliveryName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Phone</dt>
                <dd className="mt-1 text-ink">{order.deliveryPhone}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Method</dt>
                <dd className="mt-1 text-ink">{deliveryLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Estimated delivery</dt>
                <dd className="mt-1 text-ink">
                  {order.estimatedDeliveryAt
                    ? order.estimatedDeliveryAt.toLocaleString()
                    : "Not set"}
                </dd>
              </div>
              {order.deliveryAddress !== "" && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted">Address</dt>
                  <dd className="mt-1 whitespace-pre-line text-ink">{order.deliveryAddress}</dd>
                </div>
              )}
            </dl>
            {order.notes !== "" && (
              <div className="mt-5 border-t border-line pt-4">
                <h4 className="text-xs font-medium text-muted">Order notes</h4>
                <p className="mt-1 whitespace-pre-line text-sm text-ink">{order.notes}</p>
              </div>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          {nextStatuses.length > 0 ? (
            <section className="rounded-lg border border-line bg-surface p-5">
              <h3 className="text-lg font-semibold tracking-tight text-ink">Update status</h3>
              <p className="mt-1 text-sm text-muted">
                Only the next valid steps are shown.
              </p>
              <div className="mt-4">
                <UpdateStatusForm
                  businessId={businessId}
                  orderId={order.id}
                  nextStatuses={nextStatuses}
                />
              </div>
            </section>
          ) : (
            <section className="rounded-lg border border-line bg-surface p-5">
              <h3 className="text-lg font-semibold tracking-tight text-ink">Status</h3>
              <p className="mt-2 text-sm text-muted">
                This order is {orderStatusLabel(order.status).toLowerCase()}; no further
                status changes are possible.
              </p>
            </section>
          )}

          <section className="rounded-lg border border-line bg-surface p-5">
            <h3 className="text-lg font-semibold tracking-tight text-ink">Status history</h3>
            {/* docs/database.md §8: every status change writes a row; the initial
                creation row has a null oldStatus. Changes below follow the
                DEC-013 matrix (M6). */}
            <ol className="mt-4">
              {order.statusHistory.map((entry) => (
                <li
                  key={entry.id}
                  className="relative border-l border-line pb-4 pl-4 last:pb-0"
                >
                  <span
                    className="absolute -left-[3px] top-1.5 h-1.5 w-1.5 rounded-full bg-control"
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    {entry.oldStatus && (
                      <>
                        <OrderStatusBadge status={entry.oldStatus} />
                        <span className="text-xs text-muted" aria-hidden="true">
                          →
                        </span>
                      </>
                    )}
                    <OrderStatusBadge status={entry.newStatus} />
                  </div>
                  <p className="mt-1 text-xs text-muted">{entry.createdAt.toLocaleString()}</p>
                  {entry.note && <p className="mt-1 text-xs text-muted">{entry.note}</p>}
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5">
            <h3 className="text-lg font-semibold tracking-tight text-ink">
              Customer tracking link
            </h3>
            {/* §18/§21: the business shares this link with the customer. It is a
                bearer token — copy/share only, never rendered for the customer's
                page to echo back. */}
            <p className="mt-1 mb-3 text-sm text-muted">
              Share this link with the customer — no account is needed to follow the order.
            </p>
            <TrackingLinkActions
              token={order.publicTrackingToken}
              shareTitle={`Order ${order.orderNumber}`}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
