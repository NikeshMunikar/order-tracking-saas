// Loading state for the public tracking route (MASTER_SPEC §33). Deliberately
// content-free: it must not hint at whether the token resolves to an order,
// so it shows only neutral placeholder bars.
export default function TrackOrderLoading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-4 py-10"
    >
      <span role="status" className="sr-only">
        Loading order
      </span>
      <div className="h-12 w-44 rounded bg-raised" />
      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="h-6 w-2/3 rounded bg-raised" />
        <div className="mt-5 space-y-3">
          <div className="h-4 w-full rounded bg-raised" />
          <div className="h-4 w-5/6 rounded bg-raised" />
          <div className="h-4 w-4/6 rounded bg-raised" />
        </div>
      </div>
    </main>
  );
}
