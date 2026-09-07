// Pure slug-generation logic for M2 business creation.
//
// Deliberately has no Prisma/DB import and no "server-only" marker so it
// can be unit tested directly with node:test (see tests/unit/slug.test.ts),
// following the same pattern as src/lib/security/session-version.ts.
// Uniqueness enforcement itself (the database-level guarantee, plus the
// bounded-retry collision strategy) lives in the business service layer
// (src/server/business/business-service.ts), which is the actual
// authorization/security boundary — this module only produces candidate
// slug strings.

import { randomInt } from "node:crypto";

const MAX_SLUG_LENGTH = 60;
const FALLBACK_SLUG = "business";

/**
 * Generate a candidate slug from a business name per the approved M2 rules:
 * lowercase, convert non [a-z0-9] characters to hyphens, trim leading/
 * trailing hyphens, collapse repeated hyphens, cap at 60 characters,
 * falling back to "business" if nothing usable remains.
 *
 * This does not guarantee uniqueness — callers must handle a database
 * uniqueness-constraint collision (see randomSlugSuffix + the business
 * service's bounded retry loop), not rely on this function alone.
 */
export function slugify(name: string): string {
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  slug = slug.replace(/-+/g, "-");
  slug = slug.replace(/^-+|-+$/g, "");
  slug = slug.slice(0, MAX_SLUG_LENGTH);
  // Truncation above can leave a dangling trailing hyphen; trim again.
  slug = slug.replace(/-+$/g, "");

  return slug.length > 0 ? slug : FALLBACK_SLUG;
}

const SLUG_SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const DEFAULT_SUFFIX_LENGTH = 6;

/**
 * A short, cryptographically-random lowercase alphanumeric suffix used
 * only to disambiguate a colliding business slug (e.g. "kathmandu-bakery"
 * -> "kathmandu-bakery-a1b2c3"). This is NOT a security token — it exists
 * purely to break slug collisions cheaply, so it does not need the same
 * entropy or hashing treatment as an invitation token
 * (see src/lib/security/token.ts for that).
 */
export function randomSlugSuffix(length: number = DEFAULT_SUFFIX_LENGTH): string {
  let suffix = "";
  for (let i = 0; i < length; i += 1) {
    suffix += SLUG_SUFFIX_ALPHABET[randomInt(SLUG_SUFFIX_ALPHABET.length)];
  }
  return suffix;
}
