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
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-md border border-neutral-200 bg-white p-6">
        <h1 className="text-base font-semibold text-neutral-900">Too many requests</h1>
        <p className="mt-2 text-sm text-neutral-600">
          This link was opened too many times in a row. Please wait a few minutes and try again.
        </p>
      </div>
    </main>
  );
}
