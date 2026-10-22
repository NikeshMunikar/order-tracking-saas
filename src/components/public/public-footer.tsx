import Link from "next/link";

/**
 * Closing frame for the public experience. It repeats the product name and
 * the two real entry routes; nothing here is a placeholder sitemap.
 */
export function PublicFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-end sm:justify-between sm:px-8">
        <div>
          <p className="text-base font-semibold tracking-tight text-ink">Order Tracking</p>
          <p className="mt-1 text-sm text-muted">Order tracking for small businesses.</p>
        </div>
        <nav className="flex items-center gap-5 text-sm" aria-label="Footer">
          <Link href="/login" className="font-medium text-ink underline underline-offset-2">
            Sign in
          </Link>
          <Link href="/register" className="font-medium text-ink underline underline-offset-2">
            Create account
          </Link>
        </nav>
      </div>
    </footer>
  );
}
