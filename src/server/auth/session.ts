import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/server/auth/config";

/**
 * Require an authenticated session for a protected Server Component.
 * Redirects to /login when no valid session exists.
 *
 * This performs the actual server-side authorization boundary for
 * protected routes (MASTER_SPEC.md §4/§26: never rely on client-side route
 * guards or hidden UI state). It does not, by itself, establish tenant or
 * business authorization — that belongs to Milestone 2's membership
 * resolution layer.
 */
export async function requireSession() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session;
}
