/**
 * The single invalid/unavailable state for the public tracking route
 * (MASTER_SPEC §33). Deliberately generic and identical for a malformed token,
 * an unknown token and a server failure: it never reveals whether a token
 * pattern corresponds to a real order (docs/security.md §7).
 *
 * Not a client component, so both the tracking page and its error boundary can
 * render it.
 */
export function InvalidTrackingLink({ hint }: { hint?: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-md border border-neutral-200 bg-white p-6">
        <h1 className="text-base font-semibold text-neutral-900">
          This tracking link is invalid or no longer available.
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          {hint ?? "Check that you copied the whole link, or ask the business to send it again."}
        </p>
      </div>
    </main>
  );
}
