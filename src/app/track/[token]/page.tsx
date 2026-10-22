import { InvalidTrackingLink } from "@/components/tracking/tracking-invalid";
import { TrackingLinkActions } from "@/components/tracking/tracking-link-actions";
import { TrackingRateLimited } from "@/components/tracking/tracking-rate-limited";
import { TrackingStatusBadge } from "@/components/tracking/tracking-status-badge";
import { headers } from "next/headers";
import { isOrderStatus } from "@/lib/order-status";
import { readClientIdentityFromHeaders } from "@/lib/security/client-identity";
import {
  buildRateLimitKey,
  createRateLimiter,
  RATE_LIMIT_BOUNDARY_TRACKING,
  TRACKING_RATE_LIMIT,
} from "@/lib/security/rate-limit";
import { buildTrackingTimeline } from "@/lib/tracking";
import { getPublicTrackingOrder } from "@/server/tracking/tracking-service";

// Interim in-process fixed-window rate limiter for this boundary (DEC-015):
// process-local state, per instance, reset on restart — NOT shared across
// instances and not production-grade; the M10 host design must provide
// shared abuse protection. It runs before the token lookup and never
// weakens it: a throttled client gets a generic state without any token
// existence hint, and the service behavior is unchanged.
const trackingRateLimiter = createRateLimiter(TRACKING_RATE_LIMIT);

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

type StageState = "complete" | "current" | "upcoming";

function stageGlyph(state: StageState): string {
  if (state === "complete") return "✓";
  if (state === "current") return "●";
  return "○";
}

function stageStateText(state: StageState): string {
  if (state === "complete") return "Completed";
  if (state === "current") return "Current stage";
  return "Upcoming";
}

function glyphClass(state: StageState): string {
  if (state === "current") return "text-accent";
  if (state === "complete") return "text-ink";
  return "text-control";
}

function labelClass(state: StageState): string {
  if (state === "current") return "font-medium text-ink";
  if (state === "complete") return "text-ink";
  return "text-muted";
}

export default async function TrackOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Abuse protection runs before anything else (DEC-015). First x-forwarded-for
  // hop only; missing header ⇒ the constant local identity. All requests
  // count against the window (no success/failure distinction at SSR time).
  const requestHeaders = await headers();
  const clientIdentity = readClientIdentityFromHeaders(requestHeaders);
  const rateLimitDecision = trackingRateLimiter.consume(
    buildRateLimitKey(RATE_LIMIT_BOUNDARY_TRACKING, clientIdentity),
  );

  if (!rateLimitDecision.allowed) {
    return <TrackingRateLimited />;
  }

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
          <img src={business.logoUrl} alt="" className="h-12 w-12 rounded-md border border-line object-cover" />
        ) : null}
        <div className="min-w-0">
          <p className="text-sm text-muted">Order tracking</p>
          <h1 className="truncate text-xl font-semibold tracking-tight text-ink">{business.name}</h1>
        </div>
      </header>

      <section className="rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Order #{order.orderNumber}</h2>
          <TrackingStatusBadge status={order.status} />
        </div>

        {timeline.cancelledAt && (
          <p className="mt-4 rounded-md border border-status-negative-fg/25 bg-status-negative-bg px-3 py-2 text-sm text-status-negative-fg">
            This order was cancelled on {timeline.cancelledAt.toLocaleString()}.
          </p>
        )}

        <ol className="mt-5 flex flex-col gap-3 text-sm">
          {timeline.entries.map((entry) => (
            <li key={entry.status} className="flex items-start gap-2">
              <span aria-hidden="true" className={glyphClass(entry.state)}>
                {stageGlyph(entry.state)}
              </span>
              <span className="sr-only">{stageStateText(entry.state)}: </span>
              <span className={labelClass(entry.state)}>{entry.label}</span>
              {entry.at && (
                <time
                  dateTime={entry.at.toISOString()}
                  className="ml-auto shrink-0 text-right text-xs text-muted"
                >
                  {entry.at.toLocaleString()}
                </time>
              )}
            </li>
          ))}
        </ol>

        {order.estimatedDeliveryAt && (
          <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
            <span className="font-medium text-ink">Estimated delivery: </span>
            <time dateTime={order.estimatedDeliveryAt.toISOString()}>
              {order.estimatedDeliveryAt.toLocaleString()}
            </time>
          </p>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold tracking-tight text-ink">Items</h2>
        <ul className="mt-4 flex flex-col gap-3 text-sm">
          {order.items.map((item, index) => (
            <li key={index} className="flex items-start justify-between gap-3">
              <span className="text-ink">
                {item.quantity} × {item.productName}
                <span className="block text-xs text-muted">{money(item.unitPrice)} each</span>
              </span>
              <span className="shrink-0 text-ink">{money(item.subtotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-5 flex flex-col gap-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Subtotal</dt>
            <dd className="text-ink">{money(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Delivery fee</dt>
            <dd className="text-ink">{money(order.deliveryFee)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Discount</dt>
            <dd className="text-ink">{money(order.discount)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-line pt-3">
            <dt className="font-medium text-ink">Total</dt>
            <dd className="font-medium text-ink">{money(order.total)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold tracking-tight text-ink">
          {isPickup ? "Pickup" : "Delivery"}
        </h2>
        <div className="mt-2 flex flex-col gap-1 text-sm text-ink">
          {isPickup ? (
            <>
              <p>Collect this order from {business.name}.</p>
              {business.address && <p className="text-muted">{business.address}</p>}
            </>
          ) : (
            <>
              {order.recipientName && <p>{order.recipientName}</p>}
              {order.deliveryAddress && <p className="text-muted">{order.deliveryAddress}</p>}
            </>
          )}
        </div>
        {business.phone && (
          <p className="mt-4 border-t border-line pt-4 text-sm">
            <span className="text-muted">Need help? Call </span>
            <a
              href={`tel:${business.phone}`}
              className="font-medium text-ink underline underline-offset-2"
            >
              {business.name}
            </a>
          </p>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold tracking-tight text-ink">Share this tracking link</h2>
        <p className="mb-3 mt-1 text-sm text-muted">
          Anyone with this link can follow this order. No account is needed.
        </p>
        <TrackingLinkActions token={token} shareTitle={`Order ${order.orderNumber}`} />
      </section>
    </main>
  );
}
