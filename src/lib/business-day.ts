/**
 * Business-local calendar-day windows (DEC-014 / Milestone 8 decision D1).
 *
 * The dashboard's "Today's Orders" must follow the business's OWN clock, so the
 * day is derived from the business's stored `Business.timezone` (an IANA zone
 * name) and queried as a start-inclusive / end-exclusive UTC range
 * (`createdAt >= start && createdAt < end`).
 *
 * `Business.timezone` is stored as free text (`z.string().trim().min(1).max(100)`
 * in src/lib/validation/business.ts) and is therefore NOT guaranteed to be a
 * valid IANA zone: it can hold any string a user typed or that a browser
 * reported. This module validates the value with `Intl` and falls back to UTC
 * instead of throwing, so a bad stored value degrades to a correct UTC day
 * rather than a failed render (D1), and no region is hardcoded.
 *
 * Everything here is a pure function of its inputs (no clock read, no I/O), so
 * the boundaries — including DST transitions in a named zone — are directly
 * unit-testable.
 */

export const DEFAULT_BUSINESS_TIME_ZONE = "UTC";

export type BusinessDayWindow = {
  /** Inclusive lower bound of the business-local day, as a UTC instant. */
  start: Date;
  /** Exclusive upper bound (the next local midnight), as a UTC instant. */
  end: Date;
  /** The timezone actually used (`DEFAULT_BUSINESS_TIME_ZONE` on fallback). */
  timeZone: string;
  /** The local calendar day the window covers, as `YYYY-MM-DD`. */
  localDate: string;
};

function isValidTimeZone(candidate: string): boolean {
  try {
    // Throws RangeError for a string that is not a valid IANA zone.
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the timezone to use for a business: the stored value when it is a
 * valid IANA zone, otherwise UTC. Missing, blank or invalid values all resolve
 * to UTC (D1's safe fallback).
 */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  if (typeof timeZone !== "string") return DEFAULT_BUSINESS_TIME_ZONE;

  const candidate = timeZone.trim();
  if (candidate.length === 0 || !isValidTimeZone(candidate)) {
    return DEFAULT_BUSINESS_TIME_ZONE;
  }

  return candidate;
}

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const read = (type: string): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : 0;
  };

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** `instant`'s wall-clock reading in `timeZone`, expressed as if it were UTC. */
function wallClockAsUtcMs(instant: Date, timeZone: string): number {
  const parts = localParts(instant, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds (east-positive). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  return wallClockAsUtcMs(instant, timeZone) - instant.getTime();
}

/** The UTC instant of the local calendar date's midnight in `timeZone`. */
function localMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const naiveMidnightMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

  // Estimate from the offset at the naive instant, then refine once: the zone
  // offset either side of a DST transition can differ, and the real local
  // midnight must use the offset that is actually in force at midnight.
  const initialOffset = zoneOffsetMs(new Date(naiveMidnightMs), timeZone);
  let timestamp = naiveMidnightMs - initialOffset;

  const refinedOffset = zoneOffsetMs(new Date(timestamp), timeZone);
  if (refinedOffset !== initialOffset) {
    timestamp = naiveMidnightMs - refinedOffset;
  }

  return new Date(timestamp);
}

/**
 * The business-local calendar day containing `now`, as a start-inclusive /
 * end-exclusive UTC window (DEC-014 D1). An invalid or missing stored zone
 * falls back to UTC.
 */
export function businessDayWindow(
  now: Date,
  timeZone: string | null | undefined,
): BusinessDayWindow {
  const zone = resolveTimeZone(timeZone);
  const parts = localParts(now, zone);

  const start = localMidnightUtc(parts.year, parts.month, parts.day, zone);
  const nextDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const end = localMidnightUtc(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    zone,
  );

  const pad = (value: number) => String(value).padStart(2, "0");

  return {
    start,
    end,
    timeZone: zone,
    localDate: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
  };
}
