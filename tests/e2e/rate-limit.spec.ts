import { expect, test } from "@playwright/test";

// DEC-015: the public tracking route is protected by an in-process
// fixed-window limiter (60 requests / 10 minutes, keyed by the first
// x-forwarded-for hop). This suite sends 61 requests from ONE fresh run
// identity (unique per run so earlier runs never contaminate the window)
// and asserts: 60 unthrottled requests, then the generic "Too many
// requests" state (HTTP 200 by design for this interim control).
//
// Unknown tokens do not leak account data — the unthrottled body is the
// generic tracking-invalid state.

const runIdentity = `10.203.7.${Date.now() % 1_000_000}`;

test("public tracking route throttles after the DEC-015 fixed-window threshold", async ({
  request,
  baseURL,
}) => {
  const token = `e2e-rate-limit-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const trackingUrl = `${baseURL}/track/${token}`;

  for (let index = 1; index <= 60; index += 1) {
    const response = await request.get(trackingUrl, {
      headers: { "x-forwarded-for": runIdentity },
    });
    const body = await response.text();
    expect(body, `request ${index} should not be throttled`).not.toContain("Too many requests");
    expect(body, "invalid tokens still render the generic invalid state").toContain(
      "This tracking link is invalid or no longer available.",
    );
  }

  const throttled = await request.get(trackingUrl, {
    headers: { "x-forwarded-for": runIdentity },
  });
  expect(throttled.status()).toBe(200);
  const body = await throttled.text();
  expect(body).toContain("Too many requests");
  expect(body).not.toContain("This tracking link is invalid or no longer available.");
});
