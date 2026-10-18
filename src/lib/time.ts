/**
 * Explicit clock seam.
 *
 * Server Components and request handlers render per request, so reading the
 * current time there is correct and expected. Centralising it in one named
 * function keeps the read out of component render bodies (which React's
 * purity rules treat as impure) and gives tests one place to reason about.
 */
export function nowMs(): number {
  return Date.now();
}
