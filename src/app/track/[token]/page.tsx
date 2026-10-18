import { InvalidTrackingLink } from "@/components/tracking/tracking-invalid";
import { TrackingLinkActions } from "@/components/tracking/tracking-link-actions";
import { isOrderStatus } from "@/lib/order-status";
import { buildTrackingTimeline, trackingStatusLabel } from "@/lib/tracking";
import { getPublicTrackingOrder } from "@/server/tracking/tracking-service";

// M7 public customer tracking page (MASTER_SPEC §15/§16, docs/ui-ux.md §10).
//
// Public by construction: this route is NOT inside the `(dashboard)` group, so
// no session is required. The bearer token in the URL is the only input; the
// page never accepts a business or order id, and every value it renders comes
// from the deliberately limited DTO built by getPublicTrackingOrder
// (docs/security.md §7). A missing/unknown/invalid token renders the same
// generic invalid state — never a raw error, and never a hint about whether a
// token exists.
//
// Mobile-first: one narrow column, status and order summary first, the
// timeline and item lines as plain stacked rows (MASTER_SPEC §34).

function statusBadgeClass(status: string): string {
  if (status === "CANCELLED") {
    return "rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700";
  }
  if (status === "DELIVERED") {
    return "rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700";
  }
  return "rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700";
}

function stageGlyph(state: "complete" | "current" | "upcoming"): string {
  if (state === "complete") return "✓";
  if (state === "current") return "●";
  return "○";
}

function stageStateText(state: "complete" | "current" | "upcoming"): string {
  if (state === "complete") return "Completed";
  if (state === "current") return "Current stage";
  return "Upcoming";
}

export default async function TrackOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tracking = await getPublicTrackingOrder(token);

  if (!tracking) {
    return <InvalidTrackingLink />;
  }

  const { business, order } = tracking;
  const timeline = buildTrackingTimeline(
    isOrderStatus(order.status) ? order.status : "PENDING",
    order.reachedAt,
  );
  const isPickup = order.deliveryType === "PICKUP";
  const money = (amount: string) => `${business.currency} ${amount}`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 px-4 py-8 sm:py-12">
      <header className="flex items-center gap-3">
        {business.logoUrl ? (
          // The logo URL is business-supplied and may be any remote host, so a
          // plain <img> avoids configuring next/image remote patterns for it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.logoUrl} alt="" className="h-11 w-11 rounded-md object-cover" />
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Order tracking
          </p>
          <h1 className="truncate text-lg font-semibold text-neutral-900">{business.name}</h1>
        </div>
      </header>

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-neutral-900">Order #{order.orderNumber}</h2>
          <span className={statusBadgeClass(order.status)}>
            {trackingStatusLabel(order.status)}
          </span>
        </div>

        {timeline.cancelledAt && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            This order was cancelled on {timeline.cancelledAt.toLocaleString()}.
          </p>
        )}

        <ol className="mt-4 flex flex-col gap-2.5 text-sm">
          {timeline.entries.map((entry) => (
            <li key={entry.status} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className={
                  entry.state === "upcoming" ? "text-neutral-300" : "text-neutral-900"
                }
              >
                {stageGlyph(entry.state)}
              </span>
              <span className="sr-only">{stageStateText(entry.state)}: </span>
              <span
                className={
                  entry.state === "current"
                    ? "font-medium text-neutral-900"
                    : entry.state === "complete"
                      ? "text-neutral-700"
                      : "text-neutral-400"
                }
              >
                {entry.label}
              </span>
              {entry.at && (
                <span className="ml-auto shrink-0 text-right text-xs text-neutral-400">
                  {entry.at.toLocaleString()}
                </span>
              )}
            </li>
          ))}
        </ol>

        {order.estimatedDeliveryAt && (
          <p className="mt-4 border-t border-neutral-200 pt-3 text-sm text-neutral-700">
            <span className="font-medium text-neutral-900">Estimated delivery: </span>
            {order.estimatedDeliveryAt.toLocaleString()}
          </p>
        )}
      </section>

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Items</h2>
        <ul className="mt-3 flex flex-col gap-3 text-sm">
          {order.items.map((item, index) => (
            <li key={index} className="flex items-start justify-between gap-3">
              <span className="text-neutral-900">
                {item.quantity} × {item.productName}
                <span className="block text-xs text-neutral-500">{money(item.unitPrice)} each</span>
              </span>
              <span className="shrink-0 text-neutral-900">{money(item.subtotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-2 border-t border-neutral-200 pt-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-500">Subtotal</dt>
            <dd className="text-neutral-900">{money(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-500">Delivery fee</dt>
            <dd className="text-neutral-900">{money(order.deliveryFee)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-500">Discount</dt>
            <dd className="text-neutral-900">{money(order.discount)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-neutral-200 pt-2">
            <dt className="font-medium text-neutral-700">Total</dt>
            <dd className="font-medium text-neutral-900">{money(order.total)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">
          {isPickup ? "Pickup" : "Delivery"}
        </h2>
        <div className="mt-2 flex flex-col gap-1 text-sm text-neutral-700">
          {isPickup ? (
            <>
              <p>Collect this order from {business.name}.</p>
              {business.address && <p>{business.address}</p>}
            </>
          ) : (
            <>
              {order.recipientName && <p>{order.recipientName}</p>}
              {order.deliveryAddress && <p>{order.deliveryAddress}</p>}
            </>
          )}
        </div>
        {business.phone && (
          <p className="mt-3 border-t border-neutral-200 pt-3 text-sm">
            <span className="text-neutral-500">Need help? Call </span>
            <a
              href={`tel:${business.phone}`}
              className="font-medium text-neutral-900 underline underline-offset-2"
            >
              {business.name}
            </a>
          </p>
        )}
      </section>

      <section className="rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Share this tracking link</h2>
        <p className="mt-1 mb-3 text-sm text-neutral-600">
          Anyone with this link can follow this order. No account is needed.
        </p>
        <TrackingLinkActions token={token} shareTitle={`Order ${order.orderNumber}`} />
      </section>
    </main>
  );
}
