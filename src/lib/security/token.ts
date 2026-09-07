import { createHash, randomBytes } from "node:crypto";

// Invitation-token security primitives (M2). Per the approved invitation
// security requirements: CSPRNG source, 32 random bytes (256-bit entropy),
// URL-safe encoding, and a SHA-256 hash as the only form ever persisted.
//
// No "server-only" marker, deliberately: this module has no Prisma/DB
// dependency and needs to be unit tested directly with node:test (see
// tests/unit/token.test.ts), matching the existing
// src/lib/security/password.ts / session-version.ts pattern. The raw
// token never touches storage from here — callers (the invitation
// service) are responsible for persisting only tokenHash and returning
// rawToken exclusively in the immediate operation response, never logging
// or persisting it.

const TOKEN_BYTES = 32; // 256-bit entropy per the approved invitation spec.

/**
 * SHA-256 hash of a raw token, hex-encoded. Deterministic — the same raw
 * token always hashes to the same value, which is what makes hash-based
 * lookup of an incoming invitation token possible.
 *
 * SHA-256 (not Argon2id) is deliberate: this hashes a high-entropy random
 * token, not a low-entropy human password, so a slow password-hashing
 * algorithm is unnecessary overhead here. Argon2id remains reserved for
 * password hashing (src/lib/security/password.ts) per the approved
 * invitation-security requirements.
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Generate a new cryptographically secure invitation token: 32 random
 * bytes, URL-safe base64 encoded (`rawToken`, to embed in the invitation
 * link and return once), plus its SHA-256 hash (`tokenHash`, the only form
 * that may be persisted).
 */
export function generateSecureToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
  return { rawToken, tokenHash: hashToken(rawToken) };
}
