/**
 * Next.js startup hook (stable since Next.js 15 — no config flag required).
 *
 * Validates required environment configuration once per server start, so a
 * misconfigured deployment fails immediately with a clear message instead of
 * surfacing as an opaque authentication error on every request.
 *
 * Deliberately skipped during `next build`: production secrets are commonly
 * injected at runtime by the hosting platform, and a build must not require
 * them. The check therefore runs in `next dev` and `next start`.
 */
export async function register() {
  // Instrumentation can be evaluated for the edge runtime too; this check is
  // Node-only.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  const { assertAuthSecret } = await import("@/lib/env/auth-env");
  assertAuthSecret();
}
