/**
 * Resolve a post-login (or post-action) redirect destination from an
 * untrusted value.
 *
 * Only same-origin absolute paths are allowed. Parsing against a fixed
 * internal base and comparing origins rejects protocol-relative
 * ("//evil.com"), absolute ("https://evil.com"), and backslash-escaped
 * variants, so a crafted `callbackUrl` cannot turn sign-in into an open
 * redirect. Anything not recognised falls back to the given default.
 */
export function safeCallbackUrl(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  try {
    const url = new URL(value, "http://internal.invalid");
    if (url.origin !== "http://internal.invalid") {
      return fallback;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
