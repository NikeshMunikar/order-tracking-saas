type OrderLoadingVariant = "list" | "detail" | "form";

export function OrderLoading({ variant = "list" }: { variant?: OrderLoadingVariant }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span role="status" className="sr-only">
        Loading order page
      </span>

      <div className="space-y-3">
        <div className="h-4 w-24 rounded bg-raised" />
        <div className="h-8 w-56 rounded bg-raised sm:h-9" />
        <div className="h-4 w-72 max-w-full rounded bg-raised" />
      </div>

      {variant === "list" ? <ListSkeleton /> : null}
      {variant === "detail" ? <DetailSkeleton /> : null}
      {variant === "form" ? <FormSkeleton /> : null}
    </div>
  );
}

function ListSkeleton() {
  return (
    <>
      <div className="grid gap-3 rounded-lg border border-line bg-surface p-5 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
        <div className="h-11 rounded bg-raised" />
        <div className="h-11 rounded bg-raised" />
        <div className="h-11 w-24 rounded bg-raised" />
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="h-11 border-b border-line bg-raised/60" />
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex h-14 items-center gap-6 border-b border-line px-5 last:border-b-0">
            <div className="h-3 w-24 rounded bg-raised" />
            <div className="h-3 w-40 rounded bg-raised" />
            <div className="ml-auto h-5 w-20 rounded bg-raised" />
            <div className="h-3 w-16 rounded bg-raised" />
          </div>
        ))}
      </div>
    </>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-6">
        {[0, 1, 2].map((card) => (
          <div key={card} className="rounded-lg border border-line bg-surface p-5">
            <div className="h-5 w-32 rounded bg-raised" />
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="h-10 rounded bg-raised" />
              <div className="h-10 rounded bg-raised" />
              <div className="h-10 rounded bg-raised" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-6">
        {[0, 1].map((card) => (
          <div key={card} className="rounded-lg border border-line bg-surface p-5">
            <div className="h-5 w-32 rounded bg-raised" />
            <div className="mt-5 space-y-2">
              <div className="h-11 rounded bg-raised" />
              <div className="h-11 rounded bg-raised" />
              <div className="h-11 rounded bg-raised" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {[0, 1].map((card) => (
        <div key={card} className="rounded-lg border border-line bg-surface p-5 sm:p-6">
          <div className="h-5 w-32 rounded bg-raised" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="h-11 rounded bg-raised" />
            <div className="h-11 rounded bg-raised" />
            <div className="h-24 rounded bg-raised sm:col-span-2" />
          </div>
        </div>
      ))}
      <div className="h-11 w-36 rounded bg-raised" />
    </div>
  );
}
