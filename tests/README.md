# Tests

Two suites, both run with Node's built-in test runner (`node:test`). Using
`node:test` here does **not** decide `DEC-004` (unit/integration testing
framework), which remains **OPEN** in `docs/architecture-decisions.md`; it is
used only because it is already present in the repository. The suites are
written to be straightforward to port if `DEC-004` later selects a different
framework.

## Pure unit tests — `tests/unit/`

No database required. Run with:

```
npm test
```

These modules must be importable without the `@/` alias or `server-only`
(e.g. `src/lib/security/token.ts`, `src/lib/business/slug.ts`).

## Integration tests — `tests/integration/`

Require PostgreSQL. They exercise the real server services
(`src/server/business/*`), so they need the application's `@/` path alias and
must neutralise Next.js's `server-only` marker. Both are handled by a committed
ESM loader hook (`tests/helpers/alias-loader.mjs`), registered through
`--import ./tests/helpers/register.mjs`. The app itself is unaffected.

### One-time / as-needed setup

Creates a **dedicated test database** (never the development database) and
applies all committed migrations to it:

```
npm run test:db:setup
```

`register.mjs` and the fixtures derive the test database name from
`DATABASE_URL` by appending `_test` (so `order_tracking_dev` →
`order_tracking_test`). Every destructive fixture re-checks the name and
refuses to run against anything else.

### Run

```
npm run test:integration
```

The suite **fails loudly** if the database is unavailable or not migrated (it
does not silently skip). Each test truncates the M2 tables first.

## Layout

| Path | Purpose |
| --- | --- |
| `tests/unit/` | Pure, DB-free unit tests. |
| `tests/integration/` | DB-backed authorization/tenant/locking/invitation tests. |
| `tests/helpers/register.mjs` | Integration bootstrap: points `DATABASE_URL` at the `_test` DB and registers the loader. |
| `tests/helpers/alias-loader.mjs` | ESM resolve hook for the `@/*` alias and `server-only`. |
| `tests/helpers/setup-test-db.mjs` | Creates the test DB and runs `prisma migrate deploy`. |
| `tests/helpers/test-db.ts` | Fixtures, cleanup, and the test-database safety guard. |
