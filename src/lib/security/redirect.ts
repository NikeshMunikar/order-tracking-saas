/**
 * Resolve a post-login (or post-action) redirect destination from an
 * untrusted value.
 *
 * Only same-origin absolute paths are allowed. Two independent guards are
 * applied, because either one alone is insufficient:
 *
 *   1. Parse against a fixed internal base and compare origins. This
 *      rejects absolute ("https://evil.com") and backslash-smuggled
 *      variants of another host.
 *   2. Require the resulting path to start with a single "/" that is not
 *      followed by another "/" or by "\". WHATWG URL normalization collapses
 *      dot segments, so inputs such as "/.//evil.com", "/..//evil.com",
 *      "/a/..//evil.com" and "/dashboard/..//evil.com" survive guard 1 with
 *      this origin but normalize to a protocol-relative "//evil.com" path.
 *      Returning that would be a protocol-relative redirect (an open
 *      redirect) even though the origin check passed.
 *
 * Anything not recognised falls back to the given default.
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

    const path = `${url.pathname}${url.search}`;

    // A single leading "/" only. Root ("/") passes: the negative lookahead
    // has nothing to match against. Percent-encoded characters are left
    // untouched and are NOT decoded into path separators by URL parsing, so
    // they cannot be promoted to an authority component here.
    if (!/^\/(?![/\\])/.test(path)) {
      return fallback;
    }

    return path;
  } catch {
    return fallback;
  }
}
