import Link from "next/link";

/**
 * Segment-level not-found boundary (MASTER_SPEC §33, M9 safe error
 * handling): a generic 404 that reveals nothing about routes, tenants, or
 * data. It covers `notFound()` calls inside segments and unmatched top-level
 * routes rendered inside the root layout.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-4">
      <div className="rounded-md border border-neutral-200 bg-white p-6">
        <h1 className="text-base font-semibold text-neutral-900">Page not found</h1>
        <p className="mt-2 text-sm text-neutral-600">
          The page you are looking for does not exist.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
