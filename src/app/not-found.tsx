import Link from "next/link";

import { PublicState } from "@/components/public/public-state";

/**
 * Segment-level not-found boundary (MASTER_SPEC §33, M9 safe error
 * handling): a generic 404 that reveals nothing about routes, tenants, or
 * data. It covers `notFound()` calls inside segments and unmatched top-level
 * routes rendered inside the root layout.
 */
export default function NotFound() {
  return (
    <PublicState
      title="Page not found"
      action={
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-control bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-raised"
        >
          Go home
        </Link>
      }
    >
      <p>The page you are looking for does not exist.</p>
    </PublicState>
  );
}
