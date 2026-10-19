"use client";

import { useEffect } from "react";

/**
 * Root-level crash boundary (MASTER_SPEC §33, M9 safe error handling). It
 * renders its own minimal document because the root layout may itself have
 * failed, and it never surfaces any part of the raw error. The track route
 * and the dashboard segment have their own closer boundaries; this one only
 * handles a failure at the very top of the tree (including the root layout).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error(`[app] unexpected root error (${name})`);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4">
          <div className="rounded-md border border-neutral-200 bg-white p-6">
            <h1 className="text-base font-semibold text-neutral-900">Something went wrong</h1>
            <p className="mt-2 text-sm text-neutral-600">
              The application could not be loaded. Please try again in a moment.
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
      </body>
    </html>
  );
}
