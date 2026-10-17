// Bootstrap for the DB-backed integration suite. Loaded before any test module
// via `node --import` (see the `test:integration` script in package.json).
//
// It does two things:
//
//   1. Points DATABASE_URL at a DEDICATED test database. The name is derived
//      from the configured database by appending `_test` (unless it already
//      ends with `_test`), so the suite can never read or mutate development
//      data. tests/helpers/test-db.ts re-asserts this before every destructive
//      operation.
//   2. Registers the ESM resolution hooks in alias-loader.mjs.
//
// Using `node:test` here does NOT resolve DEC-004 (the unit/integration
// testing-framework decision), which remains OPEN. `node:test` is used because
// it is already present in the repository; these tests are intentionally
// straightforward to port if DEC-004 later selects something else.
import "dotenv/config"; // loads .env; dotenv does not override already-set variables
import { register } from "node:module";

const TEST_DATABASE_SUFFIX = "_test";

function deriveTestDatabaseUrl(configuredUrl) {
  const url = new URL(configuredUrl);
  const databaseName = url.pathname.replace(/^\//, "");

  url.pathname = databaseName.endsWith(TEST_DATABASE_SUFFIX)
    ? url.pathname
    : `/${databaseName}${TEST_DATABASE_SUFFIX}`;

  return url.toString();
}

const configuredUrl = process.env.DATABASE_URL;

if (!configuredUrl) {
  throw new Error(
    "DATABASE_URL is not set (checked the environment, then .env). The integration " +
      "suite requires PostgreSQL; run `node tests/helpers/setup-test-db.mjs` first.",
  );
}

process.env.DATABASE_URL = deriveTestDatabaseUrl(configuredUrl);

register(new URL("./alias-loader.mjs", import.meta.url).href, import.meta.url);
