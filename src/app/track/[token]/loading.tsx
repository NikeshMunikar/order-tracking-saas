// Loading state for the public tracking route (MASTER_SPEC §33). Deliberately
// content-free: it must not hint at whether the token resolves to an order.
export default function TrackOrderLoading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <p role="status" className="text-sm text-neutral-500">
        Loading order…
      </p>
    </main>
  );
}
