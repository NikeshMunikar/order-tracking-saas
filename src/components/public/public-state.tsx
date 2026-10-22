import type { ReactNode } from "react";

/**
 * Shared frame for the public terminal states — an invalid tracking link, a
 * rate-limited tracking link, and the top-level not-found page. It is a plain
 * server-compatible component so both server components and client error
 * boundaries can render it. The wording is always supplied by the caller and
 * stays deliberately generic.
 */
export function PublicState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-lg border border-line bg-surface p-6">
        <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
        <div className="mt-2 text-sm text-muted">{children}</div>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </main>
  );
}
