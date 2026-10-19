"use client";

import { useEffect } from "react";

/**
 * Error boundary for the whole `(dashboard)` segment (MASTER_SPEC §33,
 * M9 safe error handling). It renders one generic human-readable message and
 * never surfaces the raw error, a stack trace, SQL/provider detail, or any
 * other internal information. Only the error NAME is logged to the console
 * for diagnosis — the same name-only property the Server Actions' safe
 * message mapping keeps server-side.
 */
export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error(`[dashboard] unexpected render error (${name})`);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-4">
      <div className="rounded-md border border-neutral-200 bg-white p-6">
        <h1 className="text-base font-semibold text-neutral-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-neutral-600">
          This page could not be loaded. Please try again.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-4 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
