import type { ReactNode } from "react";

import { PublicState } from "@/components/public/public-state";

/**
 * The single invalid/unavailable state for the public tracking route
 * (MASTER_SPEC §33). Deliberately generic and identical for a malformed token,
 * an unknown token and a server failure: it never reveals whether a token
 * pattern corresponds to a real order (docs/security.md §7).
 *
 * Not a client component, so both the tracking page and its error boundary can
 * render it. `action` lets the error boundary place its recovery control
 * inside the same card instead of below the full-height state.
 */
export function InvalidTrackingLink({
  hint,
  action,
}: {
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <PublicState title="This tracking link is invalid or no longer available." action={action}>
      <p>
        {hint ?? "Check that you copied the whole link, or ask the business to send it again."}
      </p>
    </PublicState>
  );
}
