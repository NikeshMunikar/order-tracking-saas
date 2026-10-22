"use client";

import { InvalidTrackingLink } from "@/components/tracking/tracking-invalid";

// Error boundary for the public tracking route (MASTER_SPEC §33). It renders
// the same generic invalid/unavailable state as a missing token and never the
// raw error (or any part of it), so a failure cannot leak internal detail. The
// retry control lives inside the state card.
export default function TrackOrderError({ reset }: { error: Error; reset: () => void }) {
  return (
    <InvalidTrackingLink
      hint="Something went wrong while loading this order. Please try again, or ask the business to resend the link."
      action={
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-control bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-raised"
        >
          Try again
        </button>
      }
    />
  );
}
