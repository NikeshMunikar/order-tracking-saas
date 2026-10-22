import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared frame for the unauthenticated entry screens (sign in, register,
 * accept invitation). It supplies the same neutral ground, surface card, and
 * wordmark as the authenticated shell so the account screens read as part of
 * the same product. It carries no logic and no session state.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="px-5 py-6 sm:px-8">
        <Link href="/" className="text-base font-semibold tracking-tight text-ink">
          Order Tracking
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pb-16 sm:items-center sm:px-8">
        <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
