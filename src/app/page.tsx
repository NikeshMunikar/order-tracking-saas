import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/server/auth/config";

export default async function HomePage() {
  const session = await auth();

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-neutral-900">Order Tracking</h1>
      <p className="mb-8 text-sm text-neutral-500">
        Create orders, share a tracking link, and keep customers updated —
        without them needing an account.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
        >
          Create an account
        </Link>
      </div>
    </main>
  );
}
