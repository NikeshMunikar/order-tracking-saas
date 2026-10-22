import { PublicState } from "@/components/public/public-state";

/**
 * The generic rate-limited state for the public tracking route (DEC-015).
 * Rendered when the per-client fixed window is exhausted. Deliberately
 * generic: it does not reveal whether the requested token exists, and it is
 * identical for every over-limit request. The HTTP status stays 200 — a
 * server component cannot emit a real 429; having the host/proxy return
 * proper 429s is part of the Milestone 10 production design (DEC-015).
 */
export function TrackingRateLimited() {
  return (
    <PublicState title="Too many requests">
      <p>This link was opened too many times in a row. Please wait a few minutes and try again.</p>
    </PublicState>
  );
}
