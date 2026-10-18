import type { NextConfig } from "next";

/**
 * Baseline security headers (M2 audit fix pack).
 *
 * Deliberately NOT set here:
 *
 *   - A full `script-src` Content-Security-Policy. Next.js needs nonce/hash
 *     plumbing for its inline bootstrap scripts, so a script-src policy is a
 *     tracked pre-production item rather than something to ship unverified.
 *     `frame-ancestors` does not depend on scripts and is safe to enforce now.
 *   - `Strict-Transport-Security`. HSTS must be set at the host/proxy that
 *     terminates TLS for the production domain; sending it from an
 *     environment that does not serve HTTPS on that host would pin browsers
 *     incorrectly. See docs/deployment.md.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/**
 * `/invite/<token>` carries a secret in the URL path and `/login` may carry a
 * post-login destination; neither should ever leak to a third party through
 * the `Referer` header.
 */
const noReferrer = { key: "Referrer-Policy", value: "no-referrer" };

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/invite/:path*", headers: [noReferrer] },
      { source: "/login", headers: [noReferrer] },
    ];
  },
};

export default nextConfig;
