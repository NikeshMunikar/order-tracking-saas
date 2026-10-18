"use client";

import { InvalidTrackingLink } from "@/components/tracking/tracking-invalid";

// Error boundary for the public tracking route (MASTER_SPEC §33). It renders
// the same generic invalid/unavailable state as a missing token and never the
// raw error (or any part of it), so a failure cannot leak internal detail.
export default function TrackOrderError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <InvalidTrackingLink hint="Something went wrong while loading this order. Please try again, or ask the business to resend the link." />
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
      >
        Try again
      </button>
    </div>
  );
}
