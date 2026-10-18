/**
 * Escape PostgreSQL `LIKE`/`ILIKE` metacharacters in untrusted user input so
 * that a search term is always matched literally.
 *
 * Prisma's string filters (`contains`, `startsWith`, `endsWith`) expose no
 * `escape` option; on PostgreSQL they compile to `LIKE`/`ILIKE` patterns,
 * whose default escape character is the backslash. Without this, a customer
 * search for `%` matches every row and `_` acts as a single-character
 * wildcard — the search silently stops meaning "this text".
 *
 * Escaping is applied to the *value* only; callers keep using the normal
 * Prisma query API (no raw SQL is required).
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
