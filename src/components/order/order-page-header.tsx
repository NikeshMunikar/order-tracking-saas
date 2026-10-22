import Link from "next/link";
import type { ReactNode } from "react";

export function OrderPageHeader({
  backHref,
  backLabel,
  title,
  description,
  actions,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
      >
        &larr; {backLabel}
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
