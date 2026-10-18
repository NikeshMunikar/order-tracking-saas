import assert from "node:assert/strict";
import { test } from "node:test";

import type { OrderStatusValue } from "../../src/lib/order-status.ts";
import {
  TRACKING_PATH_PREFIX,
  TRACKING_STAGES,
  buildTrackingPath,
  buildTrackingTimeline,
  buildTrackingUrl,
  isPlausibleTrackingToken,
  trackingStatusLabel,
} from "../../src/lib/tracking.ts";

// M7 public tracking helpers (MASTER_SPEC §15/§16, docs/security.md §7):
// the opaque-bearer-token URL builders, the plausibility gate that must never
// change the response, and the customer-facing timeline derived from the
// order's status history.

/** A realistic stored token: 32 CSPRNG bytes as base64url (~43 chars). */
const REAL_TOKEN = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v";

test("isPlausibleTrackingToken accepts a realistic token and rejects junk", () => {
  assert.equal(isPlausibleTrackingToken(REAL_TOKEN), true);
  assert.equal(isPlausibleTrackingToken("A".repeat(32)), true);
  assert.equal(isPlausibleTrackingToken("A".repeat(128)), true);

  assert.equal(isPlausibleTrackingToken(""), false);
  assert.equal(isPlausibleTrackingToken("A".repeat(31)), false, "below the minimum length");
  assert.equal(isPlausibleTrackingToken("A".repeat(129)), false, "above the maximum length");
  assert.equal(isPlausibleTrackingToken("has space in it".padEnd(32, "x")), false);
  assert.equal(isPlausibleTrackingToken("/".repeat(40)), false, "path characters are not token data");
  assert.equal(isPlausibleTrackingToken("?".repeat(40)), false);
  assert.equal(isPlausibleTrackingToken("é".repeat(40)), false, "non-ASCII is not base64url");
});

test("buildTrackingPath produces the /track/<token> route", () => {
  assert.equal(TRACKING_PATH_PREFIX, "/track/");
  assert.equal(buildTrackingPath(REAL_TOKEN), `/track/${REAL_TOKEN}`);
  // Even an unexpected token value cannot escape the route segment.
  assert.equal(buildTrackingPath("a/b?c"), "/track/a%2Fb%3Fc");
});

test("buildTrackingUrl joins an origin and tolerates a trailing slash", () => {
  assert.equal(
    buildTrackingUrl("https://example.test", REAL_TOKEN),
    `https://example.test/track/${REAL_TOKEN}`,
  );
  assert.equal(
    buildTrackingUrl("https://example.test/", REAL_TOKEN),
    `https://example.test/track/${REAL_TOKEN}`,
  );
});

test("TRACKING_STAGES is the ordered forward workflow without CANCELLED", () => {
  assert.deepEqual(TRACKING_STAGES, [
    "PENDING",
    "CONFIRMED",
    "PREPARING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ]);
  assert.ok(!(TRACKING_STAGES as readonly string[]).includes("CANCELLED"));
});

test("trackingStatusLabel gives customer-facing labels with a raw fallback", () => {
  assert.equal(trackingStatusLabel("PENDING"), "Order received");
  assert.equal(trackingStatusLabel("OUT_FOR_DELIVERY"), "Out for delivery");
  assert.equal(trackingStatusLabel("DELIVERED"), "Delivered");
  assert.equal(trackingStatusLabel("CANCELLED"), "Cancelled");
  assert.equal(trackingStatusLabel("SOMETHING_ELSE"), "SOMETHING_ELSE");
});

test("buildTrackingTimeline marks the current stage and leaves the rest upcoming", () => {
  const timeline = buildTrackingTimeline("PENDING", { PENDING: new Date("2026-10-18T10:00:00Z") });

  assert.equal(timeline.cancelledAt, null);
  assert.deepEqual(
    timeline.entries.map((entry) => entry.state),
    ["current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"],
  );
  assert.equal(timeline.entries[0].label, "Order received");
  assert.equal(timeline.entries[1].at, null);
});

test("buildTrackingTimeline uses history timestamps to complete earlier stages", () => {
  const timeline = buildTrackingTimeline("OUT_FOR_DELIVERY", {
    PENDING: new Date("2026-10-18T10:00:00Z"),
    CONFIRMED: new Date("2026-10-18T10:05:00Z"),
    PREPARING: new Date("2026-10-18T10:20:00Z"),
    READY: new Date("2026-10-18T11:00:00Z"),
    OUT_FOR_DELIVERY: new Date("2026-10-18T11:30:00Z"),
  });

  assert.deepEqual(
    timeline.entries.map((entry) => entry.state),
    ["complete", "complete", "complete", "complete", "current", "upcoming"],
  );
  assert.equal(timeline.entries[4].at?.toISOString(), "2026-10-18T11:30:00.000Z");
  assert.equal(timeline.entries[5].at, null);
});

test("buildTrackingTimeline treats DELIVERED as the current final stage", () => {
  const timeline = buildTrackingTimeline("DELIVERED", {
    PENDING: new Date("2026-10-18T10:00:00Z"),
    DELIVERED: new Date("2026-10-18T12:00:00Z"),
  });

  assert.equal(timeline.entries[5].state, "current");
  assert.equal(timeline.cancelledAt, null);
});

test("buildTrackingTimeline reports a cancelled order without a current stage", () => {
  const timeline = buildTrackingTimeline("CANCELLED", {
    PENDING: new Date("2026-10-18T10:00:00Z"),
    CONFIRMED: new Date("2026-10-18T10:05:00Z"),
    CANCELLED: new Date("2026-10-18T10:10:00Z"),
  });

  assert.equal(timeline.cancelledAt?.toISOString(), "2026-10-18T10:10:00.000Z");
  assert.ok(timeline.entries.every((entry) => entry.state !== "current"));
  assert.deepEqual(
    timeline.entries.map((entry) => entry.state),
    ["complete", "complete", "upcoming", "upcoming", "upcoming", "upcoming"],
  );
});

test("buildTrackingTimeline defaults to an empty reachedAt map", () => {
  const timeline = buildTrackingTimeline("PENDING" satisfies OrderStatusValue);
  assert.equal(timeline.entries[0].state, "current");
  assert.equal(timeline.cancelledAt, null);
  const cancelled = buildTrackingTimeline("CANCELLED");
  assert.equal(cancelled.cancelledAt, null);
  assert.ok(cancelled.entries.every((entry) => entry.state === "upcoming"));
});
