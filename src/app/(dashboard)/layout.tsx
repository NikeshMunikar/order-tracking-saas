import Link from "next/link";

import { requireSession } from "@/server/auth/session";
import { logoutAction } from "@/server/auth/login";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side authorization boundary: this is the actual enforcement
  // point for "protected routes," not a client-side redirect or hidden UI
  // state (MASTER_SPEC.md §4/§26).
  const session = await requireSession();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center gap-2.5 text-sm font-semibold tracking-tight text-ink"
          >
            <span
              aria-hidden="true"
              className="grid h-7 w-7 place-items-center rounded-md bg-primary font-mono text-[10px] font-medium tracking-[0.08em] text-white"
            >
              OT
            </span>
            <span>Order Tracking</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="hidden max-w-[28ch] truncate text-xs text-muted sm:block">
              {session.user.email}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-md px-2.5 text-sm font-medium text-muted transition-colors hover:bg-raised hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
