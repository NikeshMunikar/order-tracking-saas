import type { OrderStatusValue } from "@/lib/order-status";

// M7 public-tracking helpers. Deliberately framework-free (no Prisma, no
// "server-only") so the server read model and the client share/copy UI share
// exactly one definition of the tracking URL and the customer-facing timeline.
//
// MASTER_SPEC.md §15/§16 and docs/security.md §7 define the public contract:
// the tracking URL carries only the opaque bearer token, the page shows only
// customer-appropriate order information, and neither the route nor the page
// ever accepts a business id, customer id or order id from the browser.

/** Route prefix of the public tracking page (MASTER_SPEC §16). */
export const TRACKING_PATH_PREFIX = "/track/";

/**
 * Plausibility gate applied to an incoming tracking token BEFORE the database
 * lookup. Stored tokens are 32 CSPRNG bytes rendered as URL-safe base64
 * (~43 characters, src/lib/security/token.ts).
 *
 * docs/security.md §7: this predicate must never change the response. A
 * malformed token and an unknown-but-well-formed token both produce the same
 * generic "invalid or no longer available" state, so a caller cannot use the
 * response to tell a well-formed token from a malformed one (or to probe the
 * token space cheaply). It is purely a way to avoid pointless database work.
 */
const TRACKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function isPlausibleTrackingToken(token: string): boolean {
  return TRACKING_TOKEN_PATTERN.test(token);
}

/** The same-origin path of a tracking link (`/track/<token>`). */
export function buildTrackingPath(token: string): string {
  return `${TRACKING_PATH_PREFIX}${encodeURIComponent(token)}`;
}

/** The absolute tracking URL for sharing/copying, built from a known origin. */
export function buildTrackingUrl(origin: string, token: string): string {
  const normalized = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${normalized}${buildTrackingPath(token)}`;
}

/**
 * The forward stages a customer sees. `CANCELLED` is intentionally not a
 * stage: a cancelled order is shown as a separate notice (MASTER_SPEC §12
 * statuses, DEC-013 matrix).
 */
export const TRACKING_STAGES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const satisfies readonly OrderStatusValue[];

/**
 * Customer-facing labels. These are intentionally friendlier than the raw
 * enum values (`ORDER_STATUS_LABELS` in src/lib/order-status.ts) and closer to
 * the wording in MASTER_SPEC §16.
 */
export const TRACKING_STAGE_LABELS: Record<OrderStatusValue, string> = {
  PENDING: "Order received",
  CONFIRMED: "Order confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** Label for any status string, falling back to the raw value. */
export function trackingStatusLabel(status: string): string {
  return (TRACKING_STAGE_LABELS as Record<string, string | undefined>)[status] ?? status;
}

export type TrackingStageState = "complete" | "current" | "upcoming";

export type TrackingTimelineEntry = {
  status: OrderStatusValue;
  label: string;
  state: TrackingStageState;
  /** When the order first reached this stage, when the history proves it. */
  at: Date | null;
};

export type TrackingTimeline = {
  entries: TrackingTimelineEntry[];
  /** When the order was cancelled, if it was. */
  cancelledAt: Date | null;
};

/**
 * Build the customer-facing timeline from the order's current status and the
 * timestamps at which each status was first reached (derived from the status
 * history the workflow writes — docs/database.md §8, DEC-013).
 *
 * A stage is "current" when it is the order's current status, "complete" when
 * the history proves it was reached and it is not the current status, and
 * "upcoming" otherwise. A cancelled order has no "current" stage: the stages
 * reached before the cancellation read as complete, the rest stay upcoming,
 * and the cancellation time is returned separately.
 */
export function buildTrackingTimeline(
  currentStatus: OrderStatusValue,
  reachedAt: Partial<Record<OrderStatusValue, Date>> = {},
): TrackingTimeline {
  const entries: TrackingTimelineEntry[] = TRACKING_STAGES.map((status) => {
    const at = reachedAt[status] ?? null;
    const state: TrackingStageState =
      status === currentStatus ? "current" : at ? "complete" : "upcoming";
    return { status, label: TRACKING_STAGE_LABELS[status], state, at };
  });

  return {
    entries,
    cancelledAt: currentStatus === "CANCELLED" ? (reachedAt.CANCELLED ?? null) : null,
  };
}
