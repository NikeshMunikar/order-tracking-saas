import assert from "node:assert/strict";
import { test } from "node:test";

import {
  businessDayWindow,
  DEFAULT_BUSINESS_TIME_ZONE,
  resolveTimeZone,
} from "../../src/lib/business-day.ts";

// DEC-014 / Milestone 8 decision D1: "today" is the business's LOCAL calendar
// day, queried as a start-inclusive / end-exclusive range, with a safe UTC
// fallback for a missing or invalid stored timezone. These tests pin the
// boundaries directly (no clock read) including a +05:45 zone and both DST
// directions.

test("resolveTimeZone keeps a valid IANA zone", () => {
  assert.equal(resolveTimeZone("Asia/Kathmandu"), "Asia/Kathmandu");
  assert.equal(resolveTimeZone("America/New_York"), "America/New_York");
  assert.equal(resolveTimeZone("UTC"), "UTC");
});

test("resolveTimeZone trims a stored value", () => {
  assert.equal(resolveTimeZone("  Asia/Kathmandu  "), "Asia/Kathmandu");
});

test("resolveTimeZone falls back to UTC for a missing or blank value", () => {
  assert.equal(resolveTimeZone(undefined), DEFAULT_BUSINESS_TIME_ZONE);
  assert.equal(resolveTimeZone(null), DEFAULT_BUSINESS_TIME_ZONE);
  assert.equal(resolveTimeZone(""), DEFAULT_BUSINESS_TIME_ZONE);
  assert.equal(resolveTimeZone("   "), DEFAULT_BUSINESS_TIME_ZONE);
});

test("resolveTimeZone falls back to UTC for a value that is not an IANA zone", () => {
  // `Business.timezone` is stored as free text, so an invalid value must not
  // throw — it degrades to a correct UTC day instead.
  assert.equal(resolveTimeZone("Nepal Standard Time"), DEFAULT_BUSINESS_TIME_ZONE);
  assert.equal(resolveTimeZone("Not/AZone"), DEFAULT_BUSINESS_TIME_ZONE);
  assert.equal(resolveTimeZone("Asia/Kathmandu; DROP TABLE"), DEFAULT_BUSINESS_TIME_ZONE);
});

test("resolveTimeZone accepts an offset time zone the runtime understands", () => {
  // Modern `Intl` accepts bare offset identifiers ("+05:45"); they are valid
  // zones, so they are used as given rather than falling back.
  assert.equal(resolveTimeZone("+05:45"), "+05:45");
});

test("businessDayWindow covers the UTC calendar day for a UTC business", () => {
  const window = businessDayWindow(new Date("2026-03-10T12:00:00.000Z"), "UTC");

  assert.equal(window.timeZone, "UTC");
  assert.equal(window.localDate, "2026-03-10");
  assert.equal(window.start.toISOString(), "2026-03-10T00:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-03-11T00:00:00.000Z");
});

test("businessDayWindow uses the local day for a non-UTC zone (+05:45)", () => {
  // 2026-03-10T18:30Z is already 2026-03-11T00:15 in Kathmandu (+05:45).
  const window = businessDayWindow(new Date("2026-03-10T18:30:00.000Z"), "Asia/Kathmandu");

  assert.equal(window.timeZone, "Asia/Kathmandu");
  assert.equal(window.localDate, "2026-03-11");
  assert.equal(window.start.toISOString(), "2026-03-10T18:15:00.000Z");
  assert.equal(window.end.toISOString(), "2026-03-11T18:15:00.000Z");
});

test("businessDayWindow includes an instant exactly at local midnight (start-inclusive)", () => {
  const start = new Date("2026-03-10T18:15:00.000Z");
  const window = businessDayWindow(start, "Asia/Kathmandu");

  assert.equal(window.localDate, "2026-03-11");
  assert.equal(window.start.toISOString(), start.toISOString());
});

test("businessDayWindow excludes the next local midnight (end-exclusive)", () => {
  const justBeforeEnd = new Date("2026-03-11T18:14:59.999Z");
  const end = new Date("2026-03-11T18:15:00.000Z");

  assert.equal(businessDayWindow(justBeforeEnd, "Asia/Kathmandu").localDate, "2026-03-11");
  assert.equal(businessDayWindow(end, "Asia/Kathmandu").localDate, "2026-03-12");
});

test("businessDayWindow handles a spring-forward day (23 hours)", () => {
  // 2026-03-08 in America/New_York: local midnight is EST (05:00Z) and the next
  // local midnight is EDT (04:00Z), so the local day is 23 hours long.
  const window = businessDayWindow(new Date("2026-03-08T12:00:00.000Z"), "America/New_York");

  assert.equal(window.localDate, "2026-03-08");
  assert.equal(window.start.toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-03-09T04:00:00.000Z");
  assert.equal(window.end.getTime() - window.start.getTime(), 23 * 60 * 60 * 1000);
});

test("businessDayWindow handles a fall-back day (25 hours)", () => {
  // 2026-11-01 in America/New_York: local midnight is EDT (04:00Z) and the next
  // local midnight is EST (05:00Z), so the local day is 25 hours long.
  const window = businessDayWindow(new Date("2026-11-01T12:00:00.000Z"), "America/New_York");

  assert.equal(window.localDate, "2026-11-01");
  assert.equal(window.start.toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-11-02T05:00:00.000Z");
  assert.equal(window.end.getTime() - window.start.getTime(), 25 * 60 * 60 * 1000);
});

test("businessDayWindow falls back to the UTC day for an invalid zone", () => {
  const invalid = businessDayWindow(new Date("2026-03-10T12:00:00.000Z"), "Not/AZone");
  const utc = businessDayWindow(new Date("2026-03-10T12:00:00.000Z"), "UTC");

  assert.equal(invalid.timeZone, "UTC");
  assert.deepEqual(invalid, utc);
});

test("businessDayWindow windows are always contiguous and ordered", () => {
  const first = businessDayWindow(new Date("2026-03-10T18:14:59.999Z"), "Asia/Kathmandu");
  const second = businessDayWindow(new Date("2026-03-10T18:15:00.000Z"), "Asia/Kathmandu");

  assert.equal(first.localDate, "2026-03-10");
  assert.equal(second.localDate, "2026-03-11");
  assert.equal(first.end.toISOString(), second.start.toISOString());
  assert.ok(first.start.getTime() < first.end.getTime());
});
