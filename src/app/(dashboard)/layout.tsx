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
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <span className="text-sm font-semibold text-neutral-900">Order Tracking</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-neutral-500">{session.user.email}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-sm font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
    </div>
  );
}
