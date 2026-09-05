import { hash, verify } from "@node-rs/argon2";

// DEC-001 (amended): Argon2id via a maintained, reputable library. Exact
// parameters are a deployment-tuned implementation detail, not an
// architectural commitment (docs/architecture-decisions.md). The values
// below are @node-rs/argon2's own recommended-default cost parameters for
// interactive login use; they can be retuned per deployment environment
// without requiring an ADR change.
const HASH_OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19456, // ~19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash a plaintext password with Argon2id. Never store the plaintext or a
 * weaker hash anywhere.
 */
export async function hashPassword(plainTextPassword: string): Promise<string> {
  return hash(plainTextPassword, HASH_OPTIONS);
}

/**
 * Verify a plaintext password against a stored Argon2id hash.
 *
 * Returns false (never throws) on mismatch or malformed hash, so callers
 * can use a single generic "invalid email or password" response without
 * distinguishing failure modes (SEC-002 / no account-existence leakage).
 */
export async function verifyPassword(
  storedHash: string,
  plainTextPassword: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, plainTextPassword);
  } catch {
    return false;
  }
}
