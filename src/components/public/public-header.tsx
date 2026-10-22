import Link from "next/link";

/**
 * Header for the public (unauthenticated) experience. Server component: it
 * holds no state and only links to routes that already exist. The wordmark
 * keeps the product identity used in the document metadata.
 */
export function PublicHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="text-base font-semibold tracking-tight text-ink">
          Order Tracking
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Account">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-ink"
          >
            Create account
          </Link>
        </nav>
      </div>
    </header>
  );
}
